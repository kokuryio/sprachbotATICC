const { createDbConnection, closeDbConnection } = require('./databaseHelper');

/**
 * Simple query to return all the users of the db
 */
async function getUsers() {
  try {
    const db = await createDbConnection();
    const [rows] = await db.query('SELECT * FROM Users ORDER BY UserId');
    console.log(rows);
    return rows;
  } catch (err) {
    console.error('Database error:', err);
  }
}


/**
 * Inserts a given user into the database
 * @param {Object} user user to insert into the DB
 */
async function insertUser(user) {
  try {
    const db = await createDbConnection();

    const [result] = await db.execute(
      `INSERT INTO Users (
        Vorname, Nachname, Geburtsdatum, Land, Stadt,
        Straße, Hausnummer, Postleitzahl, eMail,
        Telefonnummer, Erstellungsdatum
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.Vorname,
        user.Nachname,
        user.Geburtsdatum,
        user.Land,
        user.Stadt,
        user.Straße,
        user.Hausnummer,
        user.Postleitzahl,
        user.eMail,
        user.Telefonnummer,
        user.Erstellungsdatum
      ]
    );

    const insertedId = result.insertId;
    console.log('Inserted user with ID:', insertedId);
    return insertedId;
  } catch (err) {
    console.error('Insert failed:', err);
    throw err;
  }
}



/**
 * Closes database connection
 */
async function destroyDb() {
  await closeDbConnection();
}

const dataManager = {
  getUsers,
  insertUser,
  destroyDb
};

module.exports = dataManager;