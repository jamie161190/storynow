#!/bin/bash
cd ~/storytold
git add -A
git commit -m "update"
git push
echo "Done! Netlify is deploying now."
