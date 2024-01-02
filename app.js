const express = require('express');
const mysql = require('mysql2/promise');
const { MongoClient, ObjectId } = require('mongodb');

const bodyParser = require('body-parser');
const ejs = require('ejs');

const app = express();
const PORT = process.env.PORT || 3000;

let mysqlPool;
let mongoCollection;

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static('public'));

// Configure EJS as the view engine
app.set('view engine', 'ejs');

// MySQL Database Configuration
async function connectToMySQL() {
  mysqlPool = await mysql.createPool({
    connectionLimit: 10,
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'proj2023',
  });
}

// MongoDB Database Configuration
async function connectToMongoDB() {
  const client = await MongoClient.connect('mongodb://127.0.0.1:27017');
  const db = client.db('proj2023MongoDB');
  mongoCollection = db.collection('managers');
}

// Middleware to ensure database connections are established
app.use(async (req, res, next) => {
  if (!mysqlPool) {
    await connectToMySQL();
  }
  if (!mongoCollection) {
    await connectToMongoDB();
  }
  next();
});

app.get('/styles.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css');
  res.sendFile(__dirname + '/styles.css');
});

// Route for the Home Page
app.get('/', (req, res) => {
  res.render('index', { title: 'Home' });
});

// Route for the Stores Page
app.get('/stores', async (req, res) => {
  try {
    const stores = await getStoresFromDatabase();
    console.log('Stores:', stores);
    res.render('stores', { title: 'Stores', stores });
  } catch (error) {
    console.error('Error fetching store data:', error);
    res.status(500).send('Internal server error');
  }
});

// Route for the Products Page
app.get('/products', async (req, res) => {
  try {
    const products = await getProductsFromDatabase();
    res.render('products', { title: 'Products Page', products });
  } catch (error) {
    console.error('Error fetching product data:', error);
    res.status(500).send('Internal server error');
  }
});

app.get('/managers', async (req, res) => {
  try {
    const result = await mongoCollection.findOne({}); 
    if (result && result.managers) {
      const managers = result.managers;
      console.log('Managers:', managers); // Add this line for debugging
      res.render('managers', { title: 'Managers', managers });
    } else {
      res.render('managers', { title: 'Managers', managers: [] });
    }
  } catch (error) {
    console.error('Error fetching managers data:', error);
    res.status(500).send('Internal server error');
  }
});




// Route for adding a manager - GET
app.get('/managers/add', (req, res) => {
  res.render('addManager', { title: 'Add Manager' });
});

// Route for adding a manager - POST
app.post('/managers/add', async (req, res) => {
  const { ManagerID, Name, Salary } = req.body;

  try {
    // Validate Manager ID, Name, and Salary
    validateManagerInput(ManagerID, Name, Salary);

    // Check if Manager ID is unique
    const isUnique = await isManagerIdUnique(ManagerID);
    if (!isUnique) {
      throw new Error('Manager ID must be unique.');
    }

    // Insert the new manager into MongoDB
    await addManagerToMongoDB(ManagerID, Name, Salary);

    console.log('Manager added successfully:', ManagerID, Name, Salary);

    res.redirect('/managers');
  } catch (error) {
    console.error('Error adding manager:', error);
    res.status(400).send(error.message);
  }
});


// Route for adding a store
app.get('/stores/add', (req, res) => {
  res.render('addStore', { title: 'Add Store' });
});

app.post('/stores/add', async (req, res) => {
  const { SID, Location, ManagerID } = req.body;
  try {
    await addStoreToDatabase(SID, Location, ManagerID);
    res.redirect('/stores');
  } catch (error) {
    console.error('Error adding store:', error);
    res.status(500).send('Internal server error');
  }
});

// Route for editing a store - GET
app.get('/stores/edit/:SID', async (req, res) => {
  const SID = req.params.SID;
  try {
    const store = await getStoreByIdFromDatabase(SID);
    if (store) {
      res.render('editStore', { title: 'Edit Store', store });
    } else {
      res.status(404).send('Store not found');
    }
  } catch (error) {
    console.error('Error fetching store details:', error);
    res.status(500).send('Internal server error: ' + error.message);
  }
});

// Route for editing a store - POST
app.post('/stores/edit/:SID', async (req, res) => {
  const { SID } = req.params;
  const { Location, ManagerID } = req.body;

  console.log('POST request received to edit store with SID:', SID);

  try {
    // Check if Location is at least 1 character
    if (Location.length < 1) {
      return res.status(400).send('Location should be a minimum of 1 character');
    }

    // Check if ManagerID matches the pattern (4 characters)
    const managerIdPattern = /^[A-Za-z0-9]{4}$/;
    if (!managerIdPattern.test(ManagerID)) {
      return res.status(400).send('Manager ID should be 4 alphanumeric characters');
    }

    // Update the store in MySQL with both Location and ManagerID
    await updateStoreInDatabase(SID, Location, ManagerID);

    res.redirect('/stores');
  } catch (error) {
    console.error('Error updating store:', error);
    res.status(500).send('Internal server error: ' + error.message);
  }
});

// Define a route to handle product deletion
app.get('/products/delete/:pid', async (req, res) => {
  const { pid } = req.params;
  
  try {
    // Check if the product exists in any store (you need to implement this)
    const isProductInAnyStore = await checkProductInAnyStore(pid);

    if (isProductInAnyStore) {
      // If the product is in any store, display an error message
      return res.status(400).send('Cannot delete product as it is on shelf in a store.');
    }

    // If the product is not in any store, you can proceed with deletion
    await deleteProductFromDatabase(pid);
    res.redirect('/products');
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).send('Internal server error');
  }
});


// Function to retrieve stores data from MySQL
async function getStoresFromDatabase() {
  const [rows] = await mysqlPool.query('SELECT * FROM store');
  return rows;
}

// Function to add a store to MySQL
async function addStoreToDatabase(SID, Location, ManagerID) {
  await mysqlPool.query('INSERT INTO store (SID, Location, mgrid) VALUES (?, ?, ?)', [SID, Location, ManagerID]);
}

// Function to retrieve a store by ID from MySQL
async function getStoreByIdFromDatabase(SID) {
  const [rows] = await mysqlPool.query('SELECT * FROM store WHERE SID = ?', [SID]);
  return rows[0];
}

// Function to update a store's Location and ManagerID in MySQL
async function updateStoreInDatabase(SID, Location, ManagerID) {
  const query = 'UPDATE store SET Location = ?, mgrid = ? WHERE SID = ?';
  console.log('Updating store with SID:', SID);
  try {
    await mysqlPool.query(query, [Location, ManagerID, SID]);
  } catch (error) {
    console.error('Error updating store in the database:', error);
    throw error;
  }
}


// Function to check if a product is sold in any store
async function checkProductInAnyStore(pid) {
  try {
    const [result] = await mysqlPool.query('SELECT COUNT(*) AS count FROM product_store WHERE pid = ?', [pid]);
    const count = result[0].count;

    return count > 0; // Returns true if the product is sold in any store, false otherwise
  } catch (error) {
    throw error;
  }
}


// Function to delete a product from the MySQL database
async function deleteProductFromDatabase(pid) {
  try {
    // Check if the product is sold in any store
    const productSoldInStore = await checkProductInAnyStore(pid);

    if (productSoldInStore) {
      // If the product is sold in any store, do not delete it and throw an error
      throw new Error('Cannot delete product as it is currently on shelf in store.');
    }

    // Execute a DELETE query to remove the product by its Product ID
    const [result] = await mysqlPool.query('DELETE FROM product WHERE pid = ?', [pid]);

    if (result.affectedRows === 0) {
      // If no rows were affected, the product may not exist
      throw new Error('Product not found');
    }

    console.log(`Deleted product with Product ID: ${pid}`);
  } catch (error) {
    throw error;
  }
}

// Function to retrieve all managers from MongoDB
async function getManagersFromMongoDB() {
  const managers = await mongoCollection.find({}).toArray();
  return managers;
}

// Function to add a manager to MongoDB
async function addManagerToMongoDB(ManagerID, Name, Salary) {
  await mongoCollection.insertOne({ ManagerID, Name, Salary });
}

// Function to check if Manager ID is unique
async function isManagerIdUnique(ManagerID) {
  const manager = await mongoCollection.findOne({ ManagerID });
  return !manager;
}


// Function to validate Manager ID, Name, and Salary
function validateManagerInput(ManagerID, Name, Salary) {
  if (ManagerID.length !== 4) {
    throw new Error('Manager ID must be 4 characters in length.');
  }
  if (Name.length <= 5) {
    throw new Error('Name must be > 5 characters.');
  }
  const parsedSalary = parseFloat(Salary);
  if (isNaN(parsedSalary) || parsedSalary < 30000 || parsedSalary > 70000) {
    throw new Error('Salary must be between 30,000 and 70,000.');
  }
}




// Function to retrieve products data from MySQL
async function getProductsFromDatabase() {
  const query = `
    SELECT p.pid, p.productdesc, ps.Price
    FROM product p
    LEFT JOIN product_store ps ON p.pid = ps.pid
    LEFT JOIN store s ON ps.sid = s.sid
  `;

  const [rows] = await mysqlPool.query(query);
  return rows;
}




// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
