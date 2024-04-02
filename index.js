     const express =require("express");
const path =require("path");
const app = express();
const mysql = require('mysql');
const bodyParser =require('body-parser');
const cors=require("cors");
const twilio = require('twilio');


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));


app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, '/public')));



//create connection
const conn =mysql.createConnection({
    host:'localhost',
    user:'root',
    password: '',
    database:'tasks'
    // host:'database-1.cfiyxi2mso2m.eu-north-1.rds.amazonaws.com',
    // user:'admin',
    // password:'NomadZindagi1234',
    // database:'nomad',
    //  port:'3306'

});



//connect to database
conn.connect((err) =>{
    if(err) throw err;
    console.log ('Mysql Connected...');
});

//multer
const accountSid = 'ACdcca4814e4ff6194ae95210856bb4a2d';
const authToken = 'cb116472599a3b2fc2563cd5258a205d';
const twilioClient = twilio(accountSid, authToken);



app.get('/',(req,res)=>{
  res.json({message:"hello"})
})
// --------------------------------------------------------------------------------
// send otp and resend otp
app.post('/otp', (req, res) => {
  const { mobileNumber } = req.body;

  // Check if mobile number exists in the login table
  const checkLoginQuery = 'SELECT * FROM login WHERE mobile = ?';
  conn.query(checkLoginQuery, [mobileNumber], (err, loginResults) => {
      if (err) {
          console.error('Error checking mobile number in login table:', err);
          return res.status(500).json({ error: 'Failed to check mobile number.' });
      }

      if (loginResults.length > 0) {
          // Mobile number exists in the login table, generate new OTP and update the existing record
          const otpCode = Math.floor(100000 + Math.random() * 900000);

          const updateQuery = 'UPDATE login SET otp = ? WHERE mobile = ?';
          conn.query(updateQuery, [otpCode, mobileNumber], (err) => {
              if (err) {
                  console.error('Error updating OTP in login table:', err);
                  return res.status(500).json({ error: 'Failed to update OTP.' });
              }
              // Send the new OTP via SMS using Twilio
              sendOTP(mobileNumber, otpCode, res);
          });
      } else {
          // Mobile number doesn't exist in the login table
          // Check if mobile number exists in the profile table
          const checkProfileQuery = 'SELECT * FROM profile WHERE mobile = ?';
          conn.query(checkProfileQuery, [mobileNumber], (err, profileResults) => {
              if (err) {
                  console.error('Error checking mobile number in profile table:', err);
                  return res.status(500).json({ error: 'Failed to check mobile number.' });
              }

              if (profileResults.length > 0) {
                  // Mobile number exists in the profile table, show error message
                  return res.status(400).json({ error: 'Mobile number already exists.' });
              }

              // Mobile number doesn't exist in the profile table, generate new OTP and insert a new record in the login table
              const otpCode = Math.floor(100000 + Math.random() * 900000);

              const insertQuery = 'INSERT INTO login (mobile, otp) VALUES (?, ?)';
              const values = [mobileNumber, otpCode];
              conn.query(insertQuery, values, (err) => {
                  if (err) {
                      console.error('Error saving OTP to login table:', err);
                      return res.status(500).json({ error: 'Failed to save OTP.' });
                  }
                  // Send the new OTP via SMS using Twilio
                  sendOTP(mobileNumber, otpCode, res);
              });

              // Insert or update the mobile number in the profile table
              const profileUpdateQuery = 'INSERT INTO profile (mobile) VALUES (?) ON DUPLICATE KEY UPDATE mobile = ?';
              conn.query(profileUpdateQuery, [mobileNumber, mobileNumber], (err, result) => {
                  if (err) {
                      console.error('Error updating mobile number in profile table:', err);
                      // Handle error if necessary
                  }
                  // Log success message or handle as needed
              });
          });
      }
  });
});

// Function to send OTP via Twilio
function sendOTP(mobileNumber, otpCode, res) {
  twilioClient.messages
      .create({
          body: `Your OTP code is: ${otpCode}`,
          from: '+18173822963',
          to: mobileNumber
      })
      .then(() => {
          res.json({ otpCode });
      })
      .catch((error) => {
          console.error('Error sending OTP via Twilio:', error);
          res.status(500).json({ error: 'Failed to send OTP.' });
      });
}

// Function to send OTP via Twilio


    // -----------------------------------------------------------------
    // verify otp
    // Verify OTP
app.post('/verify-otp', (req, res) => {
  const { mobileNumber, otp } = req.body;

  // Check if the provided OTP matches the OTP stored in the database for the given mobile number
  const verifyQuery = 'SELECT * FROM login WHERE mobile = ? AND otp = ?';
  conn.query(verifyQuery, [mobileNumber, otp], (err, results) => {
      if (err) {
          console.error('Error verifying OTP in MySQL:', err);
          return res.status(500).json({ error: 'Failed to verify OTP.' });
      }

      if (results.length > 0) {
          // OTP verification successful
          res.json({ message: 'OTP verification successful.' });
      } else {
          // OTP verification failed
          res.status(400).json({ error: 'OTP verification failed. Please check your OTP and try again.' });
      }
  });
});
// add cash
// Add Cash
// Add Cash and Record Transaction
app.post('/add-cash', (req, res) => {
  const { mobileNumber, amount } = req.body;

  // Check if the phone number already exists in the cash table
  const checkQuery = 'SELECT * FROM cash WHERE mobile = ?';
  conn.query(checkQuery, [mobileNumber], (err, results) => {
      if (err) {
          console.error('Error checking mobile number in cash table:', err);
          return res.status(500).json({ error: 'Failed to check mobile number.' });
      }

      if (results.length > 0) {
          // Phone number already exists in the cash table, return error
          return res.status(400).json({ error: 'Phone number already exists in cash table.' });
      }

      // Start transaction
      conn.beginTransaction((err) => {
          if (err) {
              console.error('Error starting transaction in MySQL:', err);
              return res.status(500).json({ error: 'Failed to start transaction.' });
          }

          // Insert the cash record into the cash table
          const cashInsertQuery = 'INSERT INTO cash (mobile, amount) VALUES (?, ?)';
          const cashValues = [mobileNumber, amount];
          conn.query(cashInsertQuery, cashValues, (err, cashResult) => {
              if (err) {
                  console.error('Error adding cash to MySQL:', err);
                  return conn.rollback(() => {
                      res.status(500).json({ error: 'Failed to add cash.' });
                  });
              }

              const cashId = cashResult.insertId;

              // Insert the transaction record into the transaction table
              const transactionInsertQuery = 'INSERT INTO transaction (mobile, transaction, status) VALUES (?, ?, ?)';
              const transactionValues = [mobileNumber, amount, 'add Cash'];
              conn.query(transactionInsertQuery, transactionValues, (err, transactionResult) => {
                  if (err) {
                      console.error('Error adding transaction to MySQL:', err);
                      return conn.rollback(() => {
                          res.status(500).json({ error: 'Failed to record transaction.' });
                      });
                  }

                  // Commit transaction
                  conn.commit((err) => {
                      if (err) {
                          console.error('Error committing transaction in MySQL:', err);
                          return conn.rollback(() => {
                              res.status(500).json({ error: 'Failed to commit transaction.' });
                          });
                      }

                      // Respond with success message
                      res.json({ message: 'Cash added and transaction recorded successfully.', cashId, transactionId: transactionResult.insertId });
                  });
              });
          });
      });
  });
});

// withdraw cash
app.post('/withdraw-cash', (req, res) => {
  const { mobileNumber, amount } = req.body;

  // Start transaction
  conn.beginTransaction((err) => {
      if (err) {
          console.error('Error starting transaction in MySQL:', err);
          return res.status(500).json({ error: 'Failed to start transaction.' });
      }

      // Check if the phone number exists and has sufficient balance in the cash table
      const checkQuery = 'SELECT * FROM cash WHERE mobile = ?';
      conn.query(checkQuery, [mobileNumber], (err, results) => {
          if (err) {
              console.error('Error checking mobile number in cash table:', err);
              return res.status(500).json({ error: 'Failed to check mobile number.' });
          }

          if (results.length === 0) {
              // Phone number doesn't exist in the cash table
              return res.status(400).json({ error: 'Phone number not found in cash table.' });
          }

          const currentBalance = results[0].amount;
          if (currentBalance < amount) {
              // Insufficient balance
              return res.status(400).json({ error: 'Insufficient balance.' });
          }

          // Calculate new balance
          const newBalance = currentBalance - amount;

          // Update the cash table with new balance
          const updateQuery = 'UPDATE cash SET amount = ? WHERE mobile = ?';
          const updateValues = [newBalance, mobileNumber];
          conn.query(updateQuery, updateValues, (err, updateResult) => {
              if (err) {
                  console.error('Error updating cash in MySQL:', err);
                  return conn.rollback(() => {
                      res.status(500).json({ error: 'Failed to update cash.' });
                  });
              }

              // Insert the transaction record into the transaction table
              const transactionInsertQuery = 'INSERT INTO transaction (mobile, transaction, status) VALUES (?, ?, ?)';
              const transactionValues = [mobileNumber, amount, 'withdraw Cash'];
              conn.query(transactionInsertQuery, transactionValues, (err, transactionResult) => {
                  if (err) {
                      console.error('Error adding transaction to MySQL:', err);
                      return conn.rollback(() => {
                          res.status(500).json({ error: 'Failed to record transaction.' });
                      });
                  }

                  // Commit transaction
                  conn.commit((err) => {
                      if (err) {
                          console.error('Error committing transaction in MySQL:', err);
                          return conn.rollback(() => {
                              res.status(500).json({ error: 'Failed to commit transaction.' });
                          });
                      }

                      // Respond with success message
                      res.json({ message: 'Cash withdrawn and transaction recorded successfully.', newBalance });
                  });
              });
          });
      });
  });
});
// show tarnsaction
app.post('/get-transactions', (req, res) => {
  const { mobileNumber } = req.body;

  // Check if mobile number exists in the database
  const checkQuery = 'SELECT * FROM transaction WHERE mobile = ?';
  conn.query(checkQuery, [mobileNumber], (err, results) => {
      if (err) {
          console.error('Error checking mobile number in MySQL:', err);
          return res.status(500).json({ error: 'Failed to check mobile number.' });
      }

      if (results.length === 0) {
          // Mobile number doesn't exist
          return res.status(400).json({ error: 'Mobile number does not exist.' });
      }

      // Query the transaction table for all records matching the provided mobile number
      const query = 'SELECT * FROM transaction WHERE mobile = ?';
      conn.query(query, [mobileNumber], (err, results) => {
          if (err) {
              console.error('Error querying transaction table:', err);
              return res.status(500).json({ error: 'Failed to retrieve transactions.' });
          }

          // Respond with the retrieved transaction data
          res.json({ transactions: results });
      });
  });
});



app.listen(4200,()=>{
    console.log(`express server running on 4200`);
});