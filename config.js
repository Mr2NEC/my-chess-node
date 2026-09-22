// Settings come from environment variables, so no secrets live in the repository.
const required = ['JWT_SECRET', 'MYSQL_URL'];
const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
}

module.exports = {
    PORT: Number(process.env.PORT) || 4000,
    jwtSecret: process.env.JWT_SECRET,
    mysql: process.env.MYSQL_URL,
};
