# ChessBot Arena

A complete browser chess game made with HTML, CSS and JavaScript.

## Features
- Fixed and tested bot turn flow with rapid response
- Human vs ChessBot
- Easy, Medium and Hard difficulty
- Legal chess move generation
- Check and checkmate
- Stalemate
- Castling
- En passant
- Pawn promotion to queen
- Minimax AI with alpha-beta pruning
- Responsive mobile/desktop board
- Chat-style ChessBot messages
- No backend and no API key required

## Run
1. Keep `index.html`, `style.css`, and `script.js` in the same folder.
2. Double-click `index.html`, or open it with Chrome/Edge.
3. Select Easy / Medium / Hard.
4. You play White; ChessBot plays Black.

## Difficulty
- Easy: prioritizes captures but otherwise chooses random legal moves.
- Medium: searches approximately 2 plies and uses material, piece-square tables and mobility.
- Hard: searches approximately 3 plies with alpha-beta pruning.

## Important
This is an educational standalone chess implementation. A production-grade chess engine such as Stockfish would be stronger than this JavaScript engine, but would require adding an external engine/library.

- Board-size stability fix: the 8×8 board remains a fixed responsive square while moves, timer and chatbot messages update.
