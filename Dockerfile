# syntax=docker/dockerfile:1.6
# Local-only build: the resulting image contains game assets. Do not publish it.
# Original build-time repositories have disappeared; pin a known LAN-compatible runtime.
FROM --platform=linux/amd64 node:24-alpine AS client
WORKDIR /app
COPY package.json package-lock.json vite.config.ts tsconfig.json ./
RUN npm ci
COPY src/client ./src/client
RUN npm run build

FROM --platform=linux/amd64 alpine:3.21 AS bots
RUN apk add --no-cache ca-certificates curl tar xz
ARG YAPB_VERSION=4.4.957
RUN mkdir -p /bots \
    && curl -fL --retry 3 --connect-timeout 15 \
       "https://github.com/yapb/yapb/releases/download/${YAPB_VERSION}/yapb-${YAPB_VERSION}-linux.tar.xz" \
       -o /tmp/yapb.tar.xz \
    && tar -xJf /tmp/yapb.tar.xz -C /bots \
    && test -s /bots/addons/yapb/bin/yapb.so

# SteamCMD retrieves the game data during local build, not into GitHub.
FROM cm2network/steamcmd:root AS gamefiles
RUN apt-get update && apt-get install -y --no-install-recommends zip \
    && rm -rf /var/lib/apt/lists/*
USER steam
RUN ./steamcmd.sh +force_install_dir /home/steam/gamefiles +login anonymous +app_update 90 validate +quit
WORKDIR /home/steam/gamefiles
RUN test -d cstrike && test -d valve && zip -qr gamefiles.zip valve cstrike

# This fixed runtime digest is also used in Elkhan-Isayev/cs16-web.
FROM --platform=linux/386 yohimik/cs-web-server@sha256:ce01d36559ae78446baed1032252b87ee9ec639e4f2f2cdbbdcf75d75359a699 AS final
USER root
COPY --from=client /app/src/client/dist/ /xashds/public/
COPY --from=gamefiles /home/steam/gamefiles/gamefiles.zip /xashds/public/gamefiles.zip
COPY --from=bots /bots/addons/yapb/ /xashds/cstrike/addons/yapb/
COPY configs/cstrike/server.cfg /xashds/cstrike/server.cfg
COPY configs/cstrike/mapcycle.txt /xashds/cstrike/mapcycle.txt

# YaPB standalone game DLL. Fail visibly when base image layout changes.
RUN test -f /xashds/cstrike/liblist.gam \
    && grep -Eq '^gamedll_linux[[:space:]]' /xashds/cstrike/liblist.gam \
    && sed -i -E 's#^gamedll_linux[[:space:]].*#gamedll_linux "addons/yapb/bin/yapb.so"#' /xashds/cstrike/liblist.gam \
    && grep -q 'addons/yapb/bin/yapb.so' /xashds/cstrike/liblist.gam \
    && chown -R xashds:xashds /xashds/cstrike/addons/yapb \
    && chown xashds:xashds /xashds/cstrike/server.cfg /xashds/cstrike/liblist.gam
USER xashds
EXPOSE 27016/tcp 27018/udp
