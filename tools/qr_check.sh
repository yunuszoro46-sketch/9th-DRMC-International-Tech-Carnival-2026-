#!/bin/sh
# Dev check: needs python3 + opencv-python. Encodes samples in JS, decodes with OpenCV.
N=$(node tools/qr_check.js) && python3 tools/qr_check.py "$N"
