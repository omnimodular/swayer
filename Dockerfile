FROM    node:22-alpine AS base
ARG     destdir=/opt/swayer
ENV     LC_ALL=C.UTF-8
ENV     NODE_OPTIONS="--experimental-modules --experimental-json-modules --unhandled-rejections=strict"
ENV     DEBUG=swayer:*,-swayer:debug
WORKDIR $destdir
COPY    package.json package-lock.json tsconfig.json $destdir
COPY    LICENSE THIRD_PARTY_LICENSES.txt $destdir/
COPY    src $destdir/src
COPY    specs $destdir/specs
COPY    config $destdir/config
COPY    tsconfig.json $destdir/

FROM    base AS test
ENV     NODE_ENV=development
COPY    tests $destdir/tests
COPY    tools $destdir/tools
COPY    features $destdir/features
COPY    cucumber.json $destdir
RUN     npm ci
RUN     npm run test

FROM    base AS final
LABEL   org.opencontainers.image.licenses="MIT" \
        org.opencontainers.image.vendor="Omnimodular AB" \
        org.opencontainers.image.description="Executes ordered HTTP and transformation steps"
ENV     NODE_ENV=production
ENV     DEBUG_HIDE_DATE=yes
RUN     npm ci
RUN     npm run build
CMD     ["node","build/src/app.js"]
RUN     --mount=from=test,target=/mnt :
