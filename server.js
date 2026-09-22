const app = require('express')();
const server = require('http').createServer(app);
const { tokenValidate } = require('./authValidate');
const gameInit = require('./gameInit');
const { addUser } = require('./sequelize/action/addUser');
const loginUser = require('./sequelize/action/loginUser');
const jsChess = require('js-chess-engine');

const { PORT } = require('./config');
let usersArr = [];

const io = require('socket.io')(server, {
    cors: {
        origin: '*',
    },
});

io.on('connection', async (client) => {
    try {
        let user = await tokenValidate(client);
        let game = null;
        let rg = null;

        const userInOnline = usersArr.find((item) =>
            user ? item.id === user.id : null
        );

        if (userInOnline && user) {
            user = null;
            client.emit('LOGOUT');
        }

        if (user) {
            usersArr.push({
                login: user.login,
                id: user.id,
                inGame: false,
                connectionId: client.id,
            });
            client.broadcast.emit('USERONLINEADD', [
                {
                    login: user.login,
                    id: user.id,
                    inGame: false,
                    connectionId: client.id,
                },
            ]);
        } else {
            usersArr.push({
                login: 'anon',
                id: -1,
                inGame: false,
                connectionId: client.id,
            });
        }

        let authUsersArr = usersArr.filter(
            (item) =>
                item.id !== -1 &&
                item.connectionId !== client.id &&
                item.inGame !== true
        );

        client.emit('USERONLINE', authUsersArr);

        client.on('disconnect', () => {
            usersArr = usersArr.filter(
                (user) => user.connectionId !== client.id
            );
            client.broadcast.emit('USERONLINEDEL', client.id);
        });

        client.on('REGISTER', async (data, callback) => {
            try {
                await addUser(data.login, data.password);
                callback({
                    status: 200,
                });
            } catch (e) {
                client.emit('ERROR', e.message);
            }
        });

        client.on('LOGIN', async ({ login, password }) => {
            try {
                const loggedUser = await loginUser(login, password);
                const userInOnline = usersArr.find(
                    (item) => item.id === loggedUser.user.id
                );
                if (userInOnline)
                    throw new Error('The user is already online.');
                user = loggedUser.user;
                client.emit('LOGIN', loggedUser.token);
                usersArr.map((item) => {
                    if (item.connectionId === client.id) {
                        item.id = user.id;
                        item.login = user.login;
                        item.inGame = false;
                        client.broadcast.emit('USERONLINEADD', [item]);
                    }
                });
            } catch (e) {
                client.emit('ERROR', e.message);
            }
        });

        client.on('LOGOUT', () => {
            user = null;
            usersArr.map((item) => {
                if (item.connectionId === client.id) {
                    item.login = 'anon';
                    item.id = -1;
                    item.inGame = false;
                    client.broadcast.emit('USERONLINEDEL', client.id);
                }
            });
        });

        client.on('PROPOSEPLAY', (anotherSocketId) => {
            try {
                if (!user) throw new Error('Please log in to create a game.');
                client.to(anotherSocketId).emit('PROPOSEPLAY', {
                    connectionId: client.id,
                    login: user.login,
                    show: true,
                });
            } catch (e) {
                client.emit('ERROR', e.message);
            }
        });

        client.on('MOVE', async ({ from, to }) => {
            try {
                io.to(`room${game.id}`).emit('MOVE', { from, to });
                game = await gameInit(user.id, game.id);
                if (!game)
                    throw new Error('The game is not available or has ended.');
                const movementsNow = JSON.parse(game.movements);
                movementsNow.push({ from, to });
                game.movements = JSON.stringify(movementsNow);
                await game.save();
            } catch (e) {
                client.emit('ERROR', e.message);
            }
        });

        client.on('GAME', async ({ from, to }) => {
            try {
                rg.move(from, to);
                const gameState = rg.exportJson();
                io.to(`room${game.id}`).emit('GAME', { ...gameState });
                if (gameState.check && !gameState.checkMate) {
                    io.to(`room${game.id}`).emit('ALERT');
                } else if (gameState.checkMate) {
                    io.to(`room${game.id}`).emit('ALERT');
                    game.completed = true;
                    game.winnerId =
                        gameState.turn === 'black'
                            ? game.whiteId
                            : game.blackId;
                    await game.save();
                }
            } catch (e) {
                client.emit('ERROR', e.message);
            }
        });

        client.on('JOINROOM', async (room) => {
            try {
                game = await gameInit(user.id, room);
                if (!game) throw new Error('Failed to connect to the game.');
                client.join(`room${room}`);
                usersArr.map((item) => {
                    if (item.connectionId === client.id) {
                        item.inGame = true;
                    }
                });
                client.broadcast.emit('USERONLINEDEL', client.id);
                rg = new jsChess.Game();
                if (!rg)
                    throw new Error(
                        'An error occurred while creating the game.'
                    );
                const gameState = rg.exportJson();
                io.to(`room${game.id}`).emit('GAME', { ...gameState });
            } catch (e) {
                client.emit('ERROR', e.message);
            }
        });

        client.on('GAMEDBINIT', async (data) => {
            try {
                if (user && !game) {
                    if (data.status === true) {
                        const anotherUser = usersArr.find(
                            (item) => item.connectionId === data.anotherSocketId
                        );
                        game = await user.createGame({
                            completed: false,
                            winner: null,
                            movements: '[]',
                        });
                        if (!game)
                            throw new Error(
                                'An error occurred while creating the game.'
                            );
                        game.blackId =
                            Math.random() > 0.5 ? user.id : anotherUser.id;
                        game.whiteId =
                            game.blackId === user.id ? anotherUser.id : user.id;
                        await game.save();
                        client.emit('PROPOSEPLAY', { show: false });
                        client.emit('GAMEDBINIT', {
                            gameId: game.id,
                            color: game.blackId === user.id ? 'black' : 'white',
                            status: true,
                        });
                        client.to(data.anotherSocketId).emit('GAMEDBINIT', {
                            gameId: game.id,
                            color: game.blackId === user.id ? 'white' : 'black',
                            status: true,
                        });
                    } else {
                        client.emit('PROPOSEPLAY', { show: false });
                        client
                            .to(data.anotherSocketId)
                            .emit('ERROR', 'User refused to play.');
                    }
                }
            } catch (e) {
                client.emit('ERROR', e.message);
            }
        });

        client.on('SENDMSG', async (text) => {
            try {
                if (user) {
                    let post = await user.createPost({ text: text });
                    if (!post) throw new Error('The message was not sent.');
                    post.GameId = game.id;
                    await post.save();
                    io.to(`room${game.id}`).emit('SENDMSG', {
                        id: post.id,
                        userId: post.UserId,
                        login: user.login,
                        text: post.text,
                        timestamp: post.createdAt,
                    });
                }
            } catch (e) {
                client.emit('ERROR', e.message);
            }
        });

        client.on('ENDGAME', async () => {
            try {
                if (user) {
                    client.leave(`room${room}`);
                    game = null;
                    rg = null;
                    usersArr.map((item) => {
                        if (item.connectionId === client.id) {
                            item.inGame = false;
                            client.broadcast.emit('USERONLINEADD', [item]);
                        }
                    });
                }
            } catch (e) {
                client.emit('ERROR', e.message);
            }
        });
    } catch (e) {
        client.emit('ERROR', e.message);
    }
});

server.listen(PORT);
