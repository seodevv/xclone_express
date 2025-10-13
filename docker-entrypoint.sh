#!/bin/sh
# docker-entrypoint.sh
envsubst '${DOMAIN_NAME}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/xclone_express.conf
exec nginx -g 'daemon off;'
