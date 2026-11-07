# Third-party components and asset boundaries

The original MIT license in LICENSE is retained. It applies to this application's orchestration/UI code, not automatically to every engine, plugin, or game asset.

| Component | Pinned source |
| --- | --- |
| Original application | https://github.com/balintsoos/cs16-web-server |
| Native Xash3D Go-compatible engine | https://github.com/jklenner/xash3d-fwgs/tree/6ada1658348f7c2f17f2d9ead0473e6c54940605 |
| Original Go-wrapper revision, preserved fork | https://github.com/jklenner/goxash3d-fwgs/tree/90b4aa816099db3c45cfa01dd8246f12473bce22 |
| Browser engine | xash3d-fwgs 1.0.0, pinned by package-lock.json |
| Browser CS client | cs16-client 0.0.2, exact original npm integrity retained |
| Bots and navigation graphs | https://github.com/yapb/yapb/releases/tag/4.4.957 |
| Dedicated-server game files | Valve SteamCMD application 90, mod cstrike |

The original yohimik engine/wrapper repositories returned 404 during the 2026-11-07 audit. The cs16-client package was unpublished from npm. Its 0.0.2 archive was recovered from the npm mirror and verified against the ORIGINAL lockfile integrity, not accepted merely because the filename matched:

```
sha512-w2lEn3B95g2/XbWHcB49KQQcfTs1G/blcvlZawLGlPZTtEaDjuY2XXuCNdfb8Uxel7g17Ou3vs9aUpTZ5e7s6Q==
```

YaPB archive SHA-256:

```
8c095ac89b9b2ccc70a66a71d608e1a570b5268c57c6083ced8c06161533a4b1
```

Do not replace the preserved native engine with its fork's current HEAD: the newer Go/network ABI is different. Check each component's own license and notices when distributing modified binaries. Xash3D and other dependencies can have requirements beyond this application's MIT license.

Valve models, textures, sounds and maps are not included in this Git repository. Download availability through SteamCMD does not itself grant unrestricted redistribution rights. Do not publish game-containing Docker images, resource ZIPs, or custom maps unless the relevant redistribution rights are established. Keep a legitimate game license where required. Private LAN deployment and public redistribution are different questions.

`fy_iceworld` is NOT promised as a bundled map. A custom map needs its authorized BSP/resources, a matching YaPB navigation graph, and an updated browser asset ZIP/manifest.
