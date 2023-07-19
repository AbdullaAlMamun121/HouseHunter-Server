const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;

const corsOptions = {
    origin: '*',
    credentials: true,
    optionSuccessStatus: 200,
}
// middleware
app.use(cors(corsOptions))
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    next();
});

// middleware for jwt token
const jwtVerify = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'Unauthorized access' });
    }
    const token = authorization.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, (error, decoded) => {
        if (error) {
            return res.status(401).send({ error: true, message: 'Unauthorized access' });
        }
        req.decoded = decoded;
        next();
    })
}

// Mongodb template

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uetnypa.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10,
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        client.connect((err) => {
            if (err) {
                console.log(err);
                return;
            }
        });

        const userCollections = client.db("HouseHunter").collection("users");
        const houseCollections = client.db("HouseHunter").collection("houses");
        const selectedHousesCollections = client.db("HouseHunter").collection("selectedHouses");

        // JWT authentication key generated
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
            res.send(token);

        });
        // verify House owner middleware
        const verifyHouseOwner = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollections.findOne(query);
            if (user?.role !== 'houseOwner') {
                return res.status(403).send({ error: true, message: 'forbidden' });
            }
            next();
        }

        app.get('/users/checkAuth', jwtVerify, (req, res) => {
            const { email } = req.decoded;
            res.json({ email });
        });

        // User login
        app.post('/login', async (req, res) => {
            const { email } = req.body;

            // Check if the user exists
            const user = await userCollections.findOne({ email });
            if (!user) {
                return res.status(401).json({ error: true, message: 'Invalid credentials' });
            }

            // Generate a JWT token
            const token = jwt.sign({ email: user.email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' });
            res.json({ token });
        });

        app.post('/logout', (req, res) => {
            // Perform any necessary logout logic (e.g., clearing session, revoking tokens, etc.)

            // Example: Clearing session and user data
            req.session.destroy((err) => {
                if (err) {
                    console.error('Error logging out:', err);
                    res.status(500).json({ error: 'Failed to logout' });
                } else {
                    res.status(200).json({ message: 'Logged out successfully' });
                }
            });
        });

        // register user
        app.put('/users/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const query = { email: email };
            const options = { upsert: true };
            const updatedDoc = {
                $set: user,
            }
            const result = await userCollections.updateOne(query, updatedDoc, options);
            res.send(result)
        });


        // get all user
        app.get('/users', async (req, res) => {
            const result = await userCollections.find().toArray();
            res.send(result);
        });

        // get user role info by api
        app.get('/users/roleInfo/:email', jwtVerify, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.status(403).send({ houseOwner: false, houseRenter: false });
                return;
            }

            const query = { email: email };
            const user = await userCollections.findOne(query);
            let houseOwner = false;
            let houseRenter = false;

            if (user) {
                if (user.role === 'houseOwner') {
                    houseOwner = true;
                } else if (user.role === 'houseRenter') {
                    houseRenter = true;
                }
            }
            res.send({ houseOwner, houseRenter });
        });

        // Insert houses data
        app.post('/houses', async (req, res) => {
            const housesInfo = req.body;
            const result = await houseCollections.insertOne(housesInfo)
            res.send(result)
        })
        // get all houses
        app.get('/houses', jwtVerify, verifyHouseOwner, async (req, res) => {
            const result = await houseCollections.find().toArray();
            res.send(result)
        })
        app.get('/houses/show', async (req, res) => {
            const result = await houseCollections.find().toArray();
            res.send(result)
        })


        // Add houses item updates
        app.put('/updateHouses/:id', async (req, res) => {
            // Set the necessary headers to allow cross-origin request
            res.setHeader('Access-Control-Allow-Origin', 'https://languagelearning-5d814.web.app');
            res.setHeader('Access-Control-Allow-Methods', 'PUT');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

            const id = req.params.id;
            console.log(id);
            const body = req.body;
            console.log(body)
            console.log(body)
            const filter = { _id: new ObjectId(id) };
            const updateMyHouses = {
                $set: {
                    name: body.name,
                    address: body.address,
                    city: body.city,
                    price: parseFloat(body.price),

                }
            };
            const result = await houseCollections.updateOne(filter, updateMyHouses);
            res.send(result);
        })

        // delete houses by author
        app.delete('/houses/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await houseCollections.deleteOne(query);
            res.send(result);
        })
        // selected houses
        app.get('/selectedHouses', jwtVerify, async (req, res) => {
            const email = req.decoded.email;
            const query = { email: email };
            const result = await selectedHousesCollections.find(query).toArray();
            res.send(result);
        });

        // delete selected houses
        app.delete('/selectedHouses/:id', jwtVerify, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await selectedHousesCollections.deleteOne(query);
            res.send(result);
        })


        // selected houses 
        app.post('/selectedHouses', jwtVerify, async (req, res) => {
            const selectHouse = req.body;
            const email = req.body.email;
            const houseId = req.body.id;

            // Check if the user has previously selected two houses
            const houseCount = await selectedHousesCollections.countDocuments({ email });

            if (houseCount >= 2) {
                // The user has already selected two houses
                res.send({ error: 'You have already selected two houses. Cannot select more.' });
            } else {
                // Check if the user has previously selected the same house
                const previousSelection = await selectedHousesCollections.findOne({ email, id: houseId });

                if (previousSelection) {
                    // The user has already selected the same house
                    res.send({ error: 'This house has already been selected by the user.' });
                } else {
                    // The user has not selected the same house before
                    const result = await selectedHousesCollections.insertOne(selectHouse);
                    res.send(result);
                }
            }
        });



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send("House Hunter is running!");
});

app.listen(port, () => {
    console.log("Listening on port", port);
})