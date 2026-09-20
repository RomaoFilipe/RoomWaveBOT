# ============================================================
# ROOMWAVE RADIO - AUDIO ENGINE VIA HARBOR
# ============================================================

settings.server.telnet := true
settings.server.telnet.bind_addr := "127.0.0.1"
settings.server.telnet.port := 1234

# Harbor apenas local.
# Não fica exposto à Internet.
settings.harbor.bind_addrs := ["127.0.0.1"]

# Password desta ligação interna.
harbor_password =
  environment.get(
    default="roomwave-local-harbor",
    "ROOMWAVE_HARBOR_PASSWORD"
  )

# ============================================================
# AUDIO ENGINE INPUT
# ============================================================

audio_engine = input.harbor(
  "roomwave-engine",
  id="roomwave_audio_engine",
  port=3211,
  user="source",
  password=harbor_password,
  buffer=1.0,
  max=5.0
)

# Quando o Audio Engine não estiver a transmitir,
# Liquidsoap mantém a rádio online com silêncio.
radio = fallback(
  track_sensitive=false,
  [
    audio_engine,
    blank()
  ]
)

# ============================================================
# ICECAST OUTPUT
# ============================================================

# Controlo em tempo real pela API local: 0 = silêncio, 1 = nível original.
volume = interactive.float("roomwave_volume", min=0., max=1., 0.5)
radio = amplify(volume, radio)

output.icecast(
  %mp3(
    bitrate=128,
    samplerate=44100,
    stereo=true
  ),

  host="127.0.0.1",
  port=8000,

  user="source",
  password=icecast_password,

  mount="/roomwave.mp3",

  name="RoomWave Radio",
  description="RoomWave IMVU Music Radio",

  public=false,

  radio
)
