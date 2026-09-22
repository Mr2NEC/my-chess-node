const jwt = require('jsonwebtoken');
const User = require('./sequelize/schema/userSchema');
const { jwtSecret } = require('./config');

async function tokenValidate(socket) {
    try {
        const token = socket.handshake.query.token.slice('Bearer '.length);
        const decoded = jwt.verify(token, jwtSecret);
        if (decoded) {
            const user = await User.findByPk(decoded.sub.id);
            return user;
        }
        return null
    } catch (e) {
        return null;
    }
}

module.exports = { tokenValidate, jwt };
