#!/bin/sh
# Starts coturn in compose.yaml with the settings deploy/turnserver.conf
# cannot hold: the shared secret, the relay port range and the addresses.
# coturn sits behind Docker's port mapping (a NAT), so it needs both of its
# addresses: the container's own, where it opens relay ports, and the public
# one that browsers reach, which it reports for those ports. Given both as
# --external-ip=<public>/<private>, coturn also lets one relay send to
# another (both Viewers relayed) although turnserver.conf denies private
# peer addresses.
set -eu

private_ip=$(hostname -i | tr ' ' '\n' | grep -m1 '\.')

if [ -n "${TURN_EXTERNAL_IP:-}" ]; then
  public_ip=$TURN_EXTERNAL_IP
elif ! public_ip=$(detect-external-ip) || [ -z "$public_ip" ]; then
  echo "coturn: cannot find this host's public IP address; set TURN_EXTERNAL_IP in .env." >&2
  exit 1
fi

exec turnserver -c /etc/coturn/turnserver.conf \
  --relay-ip="$private_ip" \
  --external-ip="$public_ip/$private_ip" \
  --min-port="$TURN_RELAY_MIN_PORT" \
  --max-port="$TURN_RELAY_MAX_PORT" \
  --static-auth-secret="$TURN_SECRET"
