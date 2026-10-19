#!/bin/sh
# Build every screen twice: the first pass collects strings to measure, the second lays them out with real widths.
cd "$(dirname "$0")"
for s in s_*.py; do python3 $s; done
python3 measure.py
for s in s_*.py; do python3 $s; done
python3 measure.py
for s in s_*.py; do python3 $s; done
python3 measure.py
for s in s_*.py; do python3 $s; done
