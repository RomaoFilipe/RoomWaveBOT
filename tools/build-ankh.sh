#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/roomwave
revision=baefed7dcc9692c7f0ab31fac4d843031300432e
if [ ! -d _reference/Ankh/.git ]; then
  git clone https://github.com/Yucked/Ankh.git _reference/Ankh
fi
if ! git -C _reference/Ankh cat-file -e "$revision^{commit}"; then
  git -C _reference/Ankh fetch origin "$revision"
fi
mkdir -p .data/ankh-build/upstream .data/ankh-build/apps
# Extract the pinned source, leaving the reference checkout unchanged.
git -C _reference/Ankh archive "$revision" Ankh | tar -x -C .data/ankh-build/upstream
cp -a apps/ankh-service .data/ankh-build/apps/
docker build --memory=600m --memory-swap=900m -t roomwave-ankh:local -f .data/ankh-build/apps/ankh-service/Dockerfile .data/ankh-build
