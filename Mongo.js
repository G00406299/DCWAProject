const MongoClient = require('mongodb').MongoClient;

let coll;

MongoClient.connect('mongodb://127.0.0.1:27017')
.then((client) => {
    const db = client.db('proj2023MongoDB');
    coll = db.collection('managers');

})
.catch((error)=> {
    console.log(error.message);
})

const findAll = function () {
    return new Promise((resolve, reject) => {
        const cursor = coll.find();
        cursor.toArray()
        .then((documents) => {
            console.log('Documents found:', documents);
            resolve(documents);
        })
        .catch((error) => {
            console.log('Error fetching documents:', error.message);
            reject(error);
        });
    })
}

