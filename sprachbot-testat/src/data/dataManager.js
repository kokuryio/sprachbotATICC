const { createDbConnection, closeDbConnection } = require('./databaseHelper');

/**
 * Simple query to return all the users of the db
 */
async function getUsers() {
  try {
    const db = await createDbConnection();
    const result = await db.request()
      .query('SELECT UserId, Vorname, eMail FROM Users ORDER BY UserId');

    console.log(result.recordset);
    return result.recordset;
  } catch (err) {
    console.error('Database error:', err);
  }
}

/**
 * Inserts a given user into the database
 * @param {Object} user user to insert into the DB
 */
/**
 * Inserts a given user into the database
 * @param {Object} user UserTO instance to insert into the DB
 */
async function insertUser(user) {
  try {
    const db = await createDbConnection();

    const result = await db.request()
      .input('Vorname', user.Vorname)
      .input('Nachname', user.Nachname)
      .input('Geburtsdatum', user.Geburtsdatum)
      .input('Land', user.Land)
      .input('Stadt', user.Stadt)
      .input('Straße', user.Straße)
      .input('Hausnummer', user.Hausnummer)
      .input('Postleitzahl', user.Postleitzahl)
      .input('eMail', user.eMail)
      .input('Telefonnummer', user.Telefonnummer)
      .input('Erstellungsdatum', user.Erstellungsdatum)
      .query(`
        INSERT INTO Users (
          Vorname, Nachname, Geburtsdatum, Land, Stadt,
          Straße, Hausnummer, Postleitzahl, eMail,
          Telefonnummer, Erstellungsdatum
        )
        OUTPUT INSERTED.UserId
        VALUES (
          @Vorname, @Nachname, @Geburtsdatum, @Land, @Stadt,
          @Straße, @Hausnummer, @Postleitzahl, @eMail,
          @Telefonnummer, @Erstellungsdatum
        )
      `);

    const insertedId = result.recordset[0].UserId;
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