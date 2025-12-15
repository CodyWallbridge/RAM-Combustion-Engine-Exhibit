## ram combustion engine exhibit

### what it does
- serves kiosk pages on ports 8001-8004 (one page per kiosk).
- serves the percentage display on port 9000.
- serves a demo dashboard on port 9001 that embeds all kiosks and the percentage display in a grid.

### how to run
1) install python 3.
2) from the repo root, run: `python backend/main.py`
3) open the kiosk pages directly (http://localhost:8001–8004), the percentage page (http://localhost:9000), or the all-in-one demo (http://localhost:9001) (WIP).