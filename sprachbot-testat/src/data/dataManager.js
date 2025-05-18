const getDb = require('./databaseHelper');


/**
 * Simple query to return all the users of the db
 */
async function getUsers() {
  try {
    const db = await getDb();
    const users = await db('Users')
      .select('UserId', 'Vorname', 'eMail')
      .orderBy('UserId');

    console.log(users);
  } catch (err) {
    console.error('Database error:', err);
  }
}

/**
 * Inserts a given user into the database
 * @param {} user user to insert into the DB
 */
async function insertUser(user) {
  try {
    const db = await getDb();
    const [insertedId] = await db('Users')
      .insert(user)
      .returning('UserId');

    console.log('Inserted user with ID:', insertedId);
  } catch (err) {
    console.error('Insert failed:', err);
  }
}

/**
 * Closes database connection
 */
async function destroyDb(){
    const db = await getDb();
    await db.destroy();
}

const dataManager = {
  getUsers,
  insertUser,
  destroyDb
};

module.exports = dataManager;