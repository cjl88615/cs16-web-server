# amd64 host image; the legacy game engine and YaPB are 32-bit.
FROM cm2network/steamcmd:root AS gamefiles
RUN apt-get update && apt-get install -y --no-install-recommends zip && rm -rf /var/lib/apt/lists/*
USER steam
RUN ./steamcmd.sh +force_install_dir /home/steam/gamefiles +login anonymous +app_set_config 90 mod cstrike +app_update 90 validate +quit
WORKDIR /home/steam/gamefiles
RUN test -s cstrike/dlls/cs.so && test -s cstrike/maps/de_dust2.bsp && zip -qr gamefiles.zip valve cstrike \
    && printf '{"sha256":"%s"}\n' "$(sha256sum gamefiles.zip | cut -d ' ' -f 1)" > gamefiles.version.json

FROM debian:bookworm-slim AS engine
RUN dpkg --add-architecture i386 && apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git curl python3 build-essential gcc-multilib g++-multilib pkg-config libbsd-dev:i386 \
    libsdl2-dev:i386 libfreetype-dev:i386 libopus-dev:i386 libbz2-dev:i386 libvorbis-dev:i386 libopusfile-dev:i386 libogg-dev:i386 \
    && rm -rf /var/lib/apt/lists/*
ENV PKG_CONFIG_PATH=/usr/lib/i386-linux-gnu/pkgconfig
WORKDIR /xash
# This preserved revision matches the exact original Go-wrapper ABI.
RUN git init && git remote add origin https://github.com/jklenner/xash3d-fwgs.git \
    && git fetch --depth 1 origin 6ada1658348f7c2f17f2d9ead0473e6c54940605 \
    && git checkout --detach FETCH_HEAD \
    && git submodule update --init --depth 1 3rdparty/libbacktrace/libbacktrace
RUN ./waf configure -T release -d --32bits --enable-lto --enable-openmp && ./waf build -j2

FROM golang:1.26.5-bookworm AS server
RUN apt-get update && apt-get install -y --no-install-recommends gcc-multilib g++-multilib && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download && mkdir -p /build/goxash \
    && cp -a "$(go list -m -f '{{.Dir}}' github.com/yohimik/goxash3d-fwgs)"/. /build/goxash/ \
    && chmod -R u+w /build/goxash \
    && go mod edit -replace=github.com/yohimik/goxash3d-fwgs=/build/goxash
COPY --from=engine /xash/build/engine/libxash.a /build/goxash/pkg/libxash.a
COPY --from=engine /xash/build/public/libbuild_vcs.a /build/goxash/pkg/libbuild_vcs.a
COPY --from=engine /xash/build/public/libpublic.a /build/goxash/pkg/libpublic.a
COPY --from=engine /xash/build/3rdparty/libbacktrace/libbacktrace.a /build/goxash/pkg/libbacktrace.a
COPY src/server src/server
ENV GOARCH=386 CGO_ENABLED=1 CC="gcc -m32" CGO_CFLAGS="-fopenmp -m32" CGO_LDFLAGS="-fopenmp -m32"
RUN go test ./src/server && go build -trimpath -o /build/xash ./src/server

FROM debian:bookworm-slim AS bots
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /bots
RUN curl -fSL --retry 3 https://github.com/yapb/yapb/releases/download/4.4.957/yapb-4.4.957-linux.tar.xz -o yapb.tar.xz \
    && echo '8c095ac89b9b2ccc70a66a71d608e1a570b5268c57c6083ced8c06161533a4b1  yapb.tar.xz' | sha256sum -c - \
    && tar -xJf yapb.tar.xz && rm yapb.tar.xz

FROM node:24-bookworm-slim AS client
WORKDIR /client
COPY package.json package-lock.json tsconfig.json vite.config.ts ./
RUN npm ci --no-audit --no-fund
COPY src/client src/client
COPY tests tests
RUN npm run test:unit && npm run build

FROM debian:bookworm-slim AS final
ENV XASH3D_BASEDIR=/xashds LD_LIBRARY_PATH=/xashds
RUN dpkg --add-architecture i386 && apt-get update && apt-get install -y --no-install-recommends \
    libgcc-s1:i386 libstdc++6:i386 libgomp1:i386 ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r xashds && useradd -r -m -g xashds xashds
WORKDIR /xashds
COPY --from=gamefiles --chown=xashds:xashds /home/steam/gamefiles/valve ./valve
COPY --from=gamefiles --chown=xashds:xashds /home/steam/gamefiles/cstrike ./cstrike
COPY --from=bots --chown=xashds:xashds /bots/addons ./cstrike/addons
COPY --from=engine --chown=xashds:xashds /xash/build/filesystem/filesystem_stdio.so ./filesystem_stdio.so
COPY --from=server --chown=xashds:xashds /build/xash ./xash
COPY --from=client --chown=xashds:xashds /client/src/client/dist ./public
COPY --from=gamefiles --chown=xashds:xashds /home/steam/gamefiles/gamefiles.zip /home/steam/gamefiles/gamefiles.version.json ./public/
COPY --chown=xashds:xashds configs/cstrike ./cstrike
COPY --chown=xashds:xashds LICENSE VERSION THIRD_PARTY.md ./
USER xashds
EXPOSE 27016/tcp 27018/udp
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD curl -fsS --max-time 4 http://127.0.0.1:27016/readyz || exit 1
ENTRYPOINT ["./xash", "+ip", "0.0.0.0", "-port", "27015", "-game", "cstrike"]
