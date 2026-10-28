const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const dataDirectory = path.resolve(process.cwd(), 'data');
const databasePath = path.join(dataDirectory, 'ranks.sqlite');
let database = null;
let transactionDepth = 0;
const pendingExecutions = [];

function persistDatabase() {
  if (!database) throw new Error('La base SQLite no está inicializada.');
  fs.mkdirSync(dataDirectory, { recursive: true });
  const bytes = Buffer.from(database.export());
  const temporaryPath = `${databasePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, bytes);
  fs.renameSync(temporaryPath, databasePath);
}

function toRows(statement) {
  const rows = [];
  while (statement.step()) rows.push(statement.getAsObject());
  return rows;
}

function createStatementFacade(sql) {
  function execute(parameters, mode) {
    if (!database) throw new Error('La base SQLite no está inicializada.');
    const statement = database.prepare(sql);
    try {
      if (parameters?.length) {
        if (parameters.length === 1 && parameters[0] &&
            typeof parameters[0] === 'object' && !Array.isArray(parameters[0])) {
          const values = parameters[0];
          const namedValues = {};
          for (const name of sql.match(/[@:$][a-zA-Z_][a-zA-Z0-9_]*/g) || []) {
            const bareName = name.slice(1);
            namedValues[name] = values[name] ?? values[bareName];
          }
          statement.bind(namedValues);
        } else {
          statement.bind(parameters);
        }
      }
      if (mode === 'run') {
        while (statement.step()) {
          // Consume statements that return rows, including RETURNING clauses.
        }
        const result = { changes: database.getRowsModified() };
        if (!transactionDepth) persistDatabase();
        return result;
      }
      if (mode === 'get') return statement.step() ? statement.getAsObject() : undefined;
      return toRows(statement);
    } finally {
      statement.free();
    }
  }

  return {
    run(...parameters) {
      return execute(parameters, 'run');
    },
    get(...parameters) {
      return execute(parameters, 'get');
    },
    all(...parameters) {
      return execute(parameters, 'all');
    }
  };
}

const db = new Proxy({}, {
  get(_target, property) {
    if (property === 'prepare') return sql => createStatementFacade(sql);
    if (property === 'exec') {
      return sql => {
        if (!database) {
          pendingExecutions.push(sql);
          return;
        }
        database.exec(sql);
        if (!transactionDepth) persistDatabase();
      };
    }
    if (property === 'pragma') return () => undefined;
    if (property === 'transaction') {
      return callback => (...parameters) => {
        if (!database) throw new Error('La base SQLite no está inicializada.');
        database.run('BEGIN TRANSACTION');
        transactionDepth++;
        try {
          const result = callback(...parameters);
          transactionDepth--;
          database.run('COMMIT');
          if (!transactionDepth) persistDatabase();
          return result;
        } catch (error) {
          transactionDepth--;
          database.run('ROLLBACK');
          throw error;
        }
      };
    }
    if (property === 'close') {
      return () => {
        if (database) persistDatabase();
        database?.close();
        database = null;
      };
    }
    if (property === 'export') return () => database?.export();
    return undefined;
  }
});

async function initializeDatabase() {
  if (database) return database;
  fs.mkdirSync(dataDirectory, { recursive: true });
  const SQL = await initSqlJs();
  if (fs.existsSync(databasePath)) {
    const existingBytes = fs.readFileSync(databasePath);
    database = new SQL.Database(new Uint8Array(existingBytes));
  } else {
    database = new SQL.Database();
  }
  database.exec('PRAGMA foreign_keys = ON;');
  for (const sql of pendingExecutions.splice(0)) database.exec(sql);
  persistDatabase();
  return database;
}

function getDatabasePath() {
  return databasePath;
}

function closeDatabase() {
  db.close();
}

module.exports = { db, initializeDatabase, getDatabasePath, closeDatabase };
