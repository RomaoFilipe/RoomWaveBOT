from ytmusicapi import YTMusic

query = "Ghost - Mary On A Cross (Live In Tampa 2022)"

print("=" * 70)
print("ROOMWAVE - YOUTUBE MUSIC SEARCH TEST")
print("=" * 70)
print()
print("Pesquisa:", query)
print()

yt = YTMusic()

results = yt.search(
    query,
    filter="songs",
    limit=10
)

if not results:
    print("❌ Nenhum resultado encontrado")
    raise SystemExit(1)

for i, item in enumerate(results, 1):
    title = item.get("title", "Unknown")
    video_id = item.get("videoId", "")
    duration = item.get("duration", "")
    album = (
        item.get("album", {}) or {}
    ).get("name", "")

    artists = ", ".join(
        artist.get("name", "")
        for artist in item.get("artists", [])
    )

    print(f"{i}. {artists} - {title}")
    print(f"   duration: {duration}")
    print(f"   album:    {album}")
    print(f"   videoId:  {video_id}")

    if video_id:
        print(
            "   YouTube:  "
            f"https://www.youtube.com/watch?v={video_id}"
        )

    print()
