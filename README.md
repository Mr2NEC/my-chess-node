# My Chess - real-time multiplayer chess (server)

The Node.js server of a real-time multiplayer chess game: accounts, a live lobby, game invitations, moves checked by a chess engine and in-game chat. The client lives in [my-chess-react](https://github.com/Mr2NEC/my-chess-react).

> An early project from 2021. It is kept here as a record of where I started; my current work uses TypeScript and a more modern stack.

## What it does

- **Accounts.** Registration and login over the socket, passwords hashed with bcrypt, a JWT issued on login and checked on every new connection during the Socket.IO handshake.
- **Live lobby.** The server keeps the list of online players and pushes changes to everyone: who came online, who left, who is busy in a game. A second connection with the same account is logged out.
- **Invitations.** A player invites another one by their connection; on acceptance the server creates the game and assigns colours at random.
- **Game rooms.** Both players join a Socket.IO room for their game, so moves, state updates and chat reach only the two of them.
- **Rules on the server.** Every move is applied to a [js-chess-engine](https://www.npmjs.com/package/js-chess-engine) instance on the server, which rejects illegal moves and reports check and checkmate. The client renders the position the engine returns rather than its own copy.
- **Persistence.** Games, their move history, the winner and chat messages are stored in MySQL through Sequelize.

## Data model

```
User  1 - n  Game   (as the black or the white player)
User  1 - n  Post   (chat message)
Game  1 - n  Post
```

## Socket events

| Area | Events |
| --- | --- |
| Accounts | `REGISTER`, `LOGIN`, `LOGOUT` |
| Lobby | `USERONLINE`, `USERONLINEADD`, `USERONLINEDEL` |
| Invitations | `PROPOSEPLAY`, `GAMEDBINIT`, `JOINROOM` |
| Game | `MOVE`, `GAME`, `ALERT`, `ENDGAME` |
| Chat and errors | `SENDMSG`, `ERROR` |

## Stack

Node.js, Express, Socket.IO 3, Sequelize, MySQL, js-chess-engine, jsonwebtoken, bcrypt.

## Getting started

The server reads its settings from `defaults.json`: the port, the JWT secret and the Sequelize connection options for MySQL. Point it at your own database, then:

```bash
npm install
npm start
```

Use `npm run server` to run it with nodemon. The [client](https://github.com/Mr2NEC/my-chess-react) expects the server at `http://localhost:4000`.

## What I would do differently today

- Keep one engine instance per game in a shared store instead of one per connection, and validate a move before saving it
- Read secrets and connection settings from environment variables
- Write it in TypeScript with typed event payloads shared between the client and the server
- Add tests for the game flow
