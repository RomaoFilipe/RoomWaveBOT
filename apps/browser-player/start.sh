#!/usr/bin/env bash

set -euo pipefail

export HOME=/home/ubuntu
export XDG_RUNTIME_DIR=/run/user/1000
export PULSE_SERVER=unix:/run/user/1000/pulse/native

echo "🎵 RoomWave Browser Player startup"

# ------------------------------------------------------------
# PULSEAUDIO
# ------------------------------------------------------------

echo "🔊 A verificar PulseAudio..."

if ! pulseaudio --check 2>/dev/null; then
    echo "🔊 A iniciar PulseAudio..."

    pulseaudio \
      --start \
      --exit-idle-time=-1
fi

# Esperar pelo servidor PulseAudio
for i in $(seq 1 30); do

    if pactl info >/dev/null 2>&1; then
        echo "✅ PulseAudio disponível"
        break
    fi

    sleep 1

    if [ "$i" -eq 30 ]; then
        echo "❌ PulseAudio não ficou disponível"
        exit 1
    fi
done

# ------------------------------------------------------------
# PLACA VIRTUAL ROOMWAVE
# ------------------------------------------------------------

if ! pactl list short sinks \
    | awk '{print $2}' \
    | grep -qx 'roomwave'
then

    echo "🔊 A criar placa virtual roomwave..."

    pactl load-module \
      module-null-sink \
      sink_name=roomwave \
      sink_properties=device.description=RoomWave

else
    echo "✅ Placa roomwave já existe"
fi

# Tornar roomwave o sink predefinido
pactl set-default-sink roomwave

echo
echo "=== SINK ==="
pactl list short sinks | grep roomwave

echo
echo "=== MONITOR ==="
pactl list short sources | grep roomwave

# ------------------------------------------------------------
# ARRANCAR CONTROLADOR
# ------------------------------------------------------------

cd /home/ubuntu/roomwave/apps/browser-player

echo
echo "🌐 A iniciar Browser Player..."

exec /usr/bin/node server.mjs
