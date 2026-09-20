#!/usr/bin/env python3

import json
import re
import sys

from difflib import SequenceMatcher
from ytmusicapi import YTMusic


def normalize(text):
    text = (text or "").lower()

    text = re.sub(
        r"[^a-z0-9]+",
        " ",
        text
    )

    return " ".join(
        text.split()
    )


def duration_seconds(value):
    if not value:
        return 0

    try:
        parts = [
            int(x)
            for x in value.split(":")
        ]

        if len(parts) == 2:
            return (
                parts[0] * 60 +
                parts[1]
            )

        if len(parts) == 3:
            return (
                parts[0] * 3600 +
                parts[1] * 60 +
                parts[2]
            )

    except Exception:
        pass

    return 0


def score_result(
    query,
    title,
    artists,
    duration
):
    q = normalize(query)

    candidate = normalize(
        f"{artists} {title}"
    )

    score = (
        SequenceMatcher(
            None,
            q,
            candidate
        ).ratio()
        * 100
    )

    query_tokens = set(
        q.split()
    )

    result_tokens = set(
        candidate.split()
    )

    important = {
        "live",
        "tampa",
        "2022",
        "2023",
        "official",
        "audio",
        "video",
    }

    for word in important:

        if word in query_tokens:

            if word in result_tokens:
                score += 12

            else:
                score -= 8

    bad_words = {
        "cover",
        "reversed",
        "slowed",
        "reverb",
        "karaoke",
        "remix",
        "reaction",
        "fancam",
        "lyrics",
        "legendado",
        "subtitulado",
        "guitar",
    }

    for word in bad_words:

        if (
            word in result_tokens
            and
            word not in query_tokens
        ):
            score -= 18

    seconds = duration_seconds(
        duration
    )

    if (
        seconds
        and
        seconds < 120
    ):
        score -= 25

    if seconds > 900:
        score -= 10

    return round(
        score,
        2
    )


def main():

    if len(sys.argv) < 2:

        print(
            json.dumps({
                "ok": False,
                "error":
                    "Query em falta"
            })
        )

        raise SystemExit(1)

    query = " ".join(
        sys.argv[1:]
    ).strip()

    yt = YTMusic()

    collected = {}

    for kind in (
        "songs",
        "videos"
    ):

        try:

            results = yt.search(
                query,
                filter=kind,
                limit=15
            )

        except Exception:
            continue

        for item in results:

            video_id = item.get(
                "videoId"
            )

            if not video_id:
                continue

            title = item.get(
                "title",
                "Unknown"
            )

            artists = ", ".join(
                x.get(
                    "name",
                    ""
                )
                for x in item.get(
                    "artists",
                    []
                )
            )

            duration = item.get(
                "duration",
                ""
            )

            candidate = {
                "provider":
                    "youtube",

                "type":
                    kind,

                "videoId":
                    video_id,

                "externalId":
                    video_id,

                "title":
                    title,

                "artist":
                    artists,

                "duration":
                    duration,

                "durationSec":
                    duration_seconds(
                        duration
                    ),

                "url":
                    (
                        "https://www.youtube.com/"
                        "watch?v="
                        + video_id
                    ),

                "score":
                    score_result(
                        query,
                        title,
                        artists,
                        duration
                    )
            }

            previous = collected.get(
                video_id
            )

            if (
                previous is None
                or
                candidate["score"]
                >
                previous["score"]
            ):
                collected[
                    video_id
                ] = candidate

    results = sorted(
        collected.values(),
        key=lambda x:
            x["score"],
        reverse=True
    )

    if not results:

        print(
            json.dumps({
                "ok": False,
                "query": query,
                "error":
                    "Nenhum resultado encontrado"
            })
        )

        raise SystemExit(2)

    print(
        json.dumps(
            {
                "ok": True,
                "query": query,
                "best":
                    results[0],
                "results":
                    results[:5]
            },
            ensure_ascii=False
        )
    )


if __name__ == "__main__":
    main()
