const http = require('http');
const https = require('https');
const axios = require('axios');

const { executablePath } = require("puppeteer");
const puppeteerExtra = require("puppeteer-extra");
const pluginStealth = require("puppeteer-extra-plugin-stealth");
const express = require('express');
// let mysql = require("mysql");
const fs = require("fs");
const util = require('util');
const app = express();
const Browser = require('./objects/browser.js');
const passport = require('passport');
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
// const LocalStrategy = require('passport-local').Strategy; // Import LocalStrategy
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const bodyParser = require('body-parser')
// Middleware to parse JSON requests
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
})
);
app.use(cookieParser());

const path = require('path');
const logFilePath = path.join(__dirname, 'app.log');
// Redirect stdout and stderr to the log file.
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
console.log = (msg) => {
    logStream.write(msg + '\n');
    process.stdout.write(msg + '\n');
};

// const User = require('./objects/User'); // Assuming you have a User model



// CORS setup if needed
// app.use(cors());

const { secretKey } = require('./config');


// JWT strategy
const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: secretKey,
};

passport.use(
    new JwtStrategy(jwtOptions, async (jwtPayload, done) => {
        try {
            const user = await User.findById(jwtPayload.id);

            if (!user) {
                return done(null, false);
            }

            return done(null, user);
        } catch (error) {
            return done(error, false);
        }
    })
);

// Use Passport.js as middleware
app.use(passport.initialize());
// Function to format the date as "YYYY-MM-DD"
function formatDate(date) {
    const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
    return new Date(date).toLocaleDateString('en-US', options);
}


const db = require('./config/db');

const queryAsync = util.promisify(db.query).bind(db);
// Handle application shutdown gracefully
process.on('SIGINT', () => {
    db.end((err) => {
        if (err) {
            console.error('Error closing MySQL connection:', err);
        }
        console.log('MySQL connection closed');
        process.exit();
    });
});

async function get_options_by_name(name) {
    try {

        const query = 'SELECT value FROM options WHERE name = ?';
        const results = await queryAsync(query, [name]);

        if (results.length > 0) {
            const optionValue = JSON.parse(results[0].value);
            return optionValue;
        } else {
            console.log('Option not found.');
            return null;
        }
    } catch (error) {
        console.error('Error retrieving option:', error);
        return null;
    }
}

async function save_message_to_db(ad_id, conv_data, ad_details) {

    try {
        const qry1 = `SELECT conv_data FROM conversations WHERE ad_id=?`;
        const rslt = await queryAsync(qry1, [ad_id]);
        // const rslt = await util.promisify(db.query).call(db, qry1, [ad_id]);
        let conv_data_arr = [];
        if (rslt.length > 0) {
            try {
                conv_data_arr = JSON.parse(rslt[0].conv_data); // Extract the count value from the result
            } catch (error) {
                console.error('Error parsing conv_data:', rslt[0].conv_data, error);
            }
        }
        conv_data_arr.push(conv_data);

        const qry2 = 'replace INTO conversations (ad_id, conv_data, ad_details) VALUES (?, ?, ?)';
        await queryAsync(qry2, [ad_id, JSON.stringify(conv_data_arr), JSON.stringify(ad_details)]);

        console.log('Data inserted successfully.');
    } catch (error) {
        console.error('Error inserting data:', error);
    }
}

async function get_messages_from_db() {

    try {

        const qry1 = `SELECT * FROM conversations`;
        const rslt = await queryAsync(qry1);
        return rslt;

    } catch (error) {
        console.error('Error inserting data:', error);
    }
}
async function get_messages_from_db(ad_id) {

    try {

        const qry1 = `SELECT * FROM chat WHERE conversations_id=(select id from conversations where ad_id=?) ORDER BY creation_date ASC`;
        const rslt = await queryAsync(qry1, [ad_id]);
        let conv_data_arr = [];
        if (rslt.length > 0) {
            for (var i = 0; i < rslt.length; i++) {
                conv_data_arr.push({ msg: rslt[i].conv_message, dt: rslt[i].creation_date, sender: rslt[i].sender }); // Extract the count value from the result
            }
        }
        return conv_data_arr;

    } catch (error) {
        console.error('Error inserting data:', error);
    }
}

async function get_messages_ids_from_db() {

    try {
        // await util.promisify(db.connect).call(db);

        const qry1 = `SELECT ad_id FROM conversations`;
        const rslt = await queryAsync(qry1);
        let return_rslts = [];
        if (rslt && rslt.length > 0) {
            for (var i = 0; i < rslt.length; i++) {
                return_rslts.push(rslt[i].ad_id);
            }
        }
        return return_rslts;

    } catch (error) {
        console.error('Error inserting data:', error);
    }
}
async function save_option_to_db(name, options) {

    try {
        // await util.promisify(db.connect).call(db);

        const query = 'replace INTO options (name, value) VALUES (?, ?)';
        await queryAsync(query, [name, JSON.stringify(options)]);
        // await util.promisify(db.query).call(db, query, [name, JSON.stringify(options)]);

        console.log('Data inserted successfully.');
    } catch (error) {
        console.error('Error inserting data:', error);
    }
}
async function save_filters_history(filters) {
    try {
        const name = "filter_history_" + Date.now();
        await save_option_to_db(name, filters)

    } catch (error) {
        console.error('Error inserting data:', error);
    }
}
async function update_filter_history_name(orgName, newName) {
    if (orgName.indexOf('filter_history_') !== 0) {
        return;
    }
    try {
        const qry1 = `UPDATE options SET name=? WHERE name=?`;
        await queryAsync(qry1, [newName, orgName]);
    } catch (error) {
        console.error('Error update_single_queue_status_db:', error);
    }
}
async function get_All_filters_history_names() {
    try {

        const qry1 = `SELECT name FROM options where name like 'filter_history_%' ORDER BY id DESC limit 50;`;
        const rslt = await queryAsync(qry1);
        let return_rslts = [];
        if (rslt && rslt.length > 0) {
            for (var i = 0; i < rslt.length; i++) {
                return_rslts.push(rslt[i].name);
            }
        }
        return return_rslts;

    } catch (error) {
        console.error('Error inserting data:', error);
    }
}
async function remove_option_from_db(name) {

    try {
        // await util.promisify(db.connect).call(db);

        const query = 'delete from options where name = ?';
        // await util.promisify(db.query).call(db, query, [name]);
        await queryAsync(query, [name]);

        console.log('Data deleted successfully.');
    } catch (error) {
        console.error('Error deleting data:', error);
    }
}

async function insert_chat_to_db(ad_id, sender, dealer_name, conv_message, c_data) {
    try {
        const qry2 = `SELECT id FROM conversations WHERE ad_id = ?`;
        const result = await queryAsync(qry2, [ad_id]);

        if (result.length > 0) {
            const qry1 = `INSERT INTO chat(conversations_id, sender, dealer_name, conv_message) VALUES (?, ?, ?, ?)`;
            await queryAsync(qry1, [result[0].id, sender, dealer_name, conv_message]);
            console.log('Data inserted successfully.');
        } else {
            console.log('No conversation found for ad_id:', ad_id);
            await save_message_to_db(ad_id, [{ "msg": conv_message }], c_data);
            await insert_chat_to_db(ad_id, sender, dealer_name, conv_message, c_data);
        }
    } catch (error) {
        console.error('Error inserting data:', error);
    }
}

async function add_queue_to_db(urls) {
    try {
        const qry0 = `select id,url from messages_queue where isSent=0`;
        const rslt = await queryAsync(qry0);
        let queued_urls = [];
        if (rslt && rslt.length > 0) {
            for (let i = 0; i < rslt.length; i++) {
                queued_urls.push(rslt[i].url);
            }
        }

        let new_urls = [];
        for (let i = 0; i < urls.length; i++) {
            if (queued_urls.includes(urls[i])) {
                console.log("This message is already queued. " + urls[i]);
                continue;
            }
            if (!new_urls.includes(urls[i])) {
                new_urls.push(urls[i])
            }
        }

        const placeholders = new_urls.map(() => '(?)').join(', ');
        const qry1 = `INSERT INTO messages_queue(url) VALUES ${placeholders}`;
        await queryAsync(qry1, new_urls);
        console.log('Data inserted successfully.');
    } catch (error) {
        console.error('Error inserting data:', error);
    }
}

async function get_next_queue_from_db() {
    try {
        const qry1 = `select id,url from messages_queue where isSent = 0 order by id asc limit 1`;
        const rslt = await queryAsync(qry1);
        if (rslt && rslt.length > 0) {
            return rslt[0];
        }
        return '';
    } catch (error) {
        console.error('Error get_next_queue_from_db:', error);
        return '';
    }
}

async function update_single_queue_status_db(id, status) {
    try {
        const qry1 = `UPDATE messages_queue SET isSent=? WHERE id=?`;
        await queryAsync(qry1, [status, id]);
    } catch (error) {
        console.error('Error update_single_queue_status_db:', error);
    }
}
async function get_queue_messages_count() {

    try {
        const qry1 = `SELECT count(*) as not_sent,(SELECT count(*) FROM messages_queue where isSent = 1) as sent FROM messages_queue where isSent = 0;`;
        const rslt = await queryAsync(qry1);
        return rslt;

    } catch (error) {
        console.error('Error inserting data:', error);
    }
}

const crypto = require('crypto');
function MD5(str) {
    return crypto.createHash('md5').update(str).digest('hex');;
}
// async function save_to_db(adsData) {

//     // SQL query to insert multiple rows
//     const insertQuery = "replace INTO ads (ad_id, title, ad_link, price, location, date_posted, description_html, dealer_updates, imageSrc) VALUES ?";

//     // Extracting the values from the data array for insertion
//     const values = adsData.map(ad => Object.values(ad));

//     // Execute the query to insert the data
//     db.query(insertQuery, [values], (err, result) => {
//         if (err) {
//             console.error("Error inserting data: ", err);
//         } else {
//             //   console.log(`${result.affectedRows} rows inserted.`);
//         }
//     });
// }

// async function get_from_db(search_key) {
//     return new Promise((resolve, reject) => {
//         // SQL query with a parameterized query
//         const sql = 'SELECT * FROM ads WHERE title LIKE ?';

//         // Execute the SQL query with the search_key as a parameter
//         db.query(sql, [`%${search_key}%`], (err, results) => {
//             if (err) {
//                 reject(err);
//             } else {
//                 resolve(results);
//             }
//         });
//     });
// }
function getReadableDate(timestamp) {
    const date = new Date(timestamp * 1000); // Convert to milliseconds (* 1000)

    // Get the individual date components
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // Months are zero-based, so add 1
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();

    // Format the date as a string in a human-readable format
    const humanReadableDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    return (humanReadableDate); // Output: 2023-05-13 03:13:14

}
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

//-------------------------------- server config
const hostname = '127.0.0.1';
const port = 3300;

// Routes for JWT-based authentication
const authRoutes = require('./auth/auth');
app.use('/auth', authRoutes);

//-------------------------------- server functions
// Set the view engine to EJS
app.set('view engine', 'ejs');

// Set up a route to handle a GET request
let filters = { make: [] };
const main_page_url = "https://www.kijijiautos.ca/";
const myBrowser = new Browser(main_page_url);

// app.get('/api/data', async (req, res) => {
//     const response = await axios.get('https://api.example.com/data');
//     const data = response.data;
//     res.json(data);
// });
async function fetchKijijiAutoData(SearchKey) {
    const headers = {
        "accept": "application/json",
        "accept-language": "en-CA",
        "accept-version": "v2",
        "cache-control": "no-cache",
        "content-type": "application/json",
        "pragma": "no-cache",
        "sec-ch-ua": "\"Not/A)Brand\";v=\"99\", \"Google Chrome\";v=\"115\", \"Chromium\";v=\"115\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-client": "ca.move.web.app",
        "x-client-id": "024b7c8e-e5ff-4e91-869d-8c4cc6569766",
        "cookie": "mvcid=024b7c8e-e5ff-4e91-869d-8c4cc6569766; trty=e; ...", // Your full cookie string here
        "Referer": "https://www.kijijiautos.ca/",
        "Referrer-Policy": "strict-origin-when-cross-origin"
    };

    try {
        const response = await axios.get("https://www.kijijiautos.ca/consumer/place-suggestions?type=suggestions&components=country:ca&input=" + SearchKey + "&sessionToken=e6212e03-15be-42ff-8856-4fdea7575b8d", {
            headers: headers
        });
        return response.data; // Return the response data
    } catch (error) {
        throw error; // Re-throw the error to be handled by the caller
    }
}
//login api
app.get('/login', (req, res) => {
    res.render('au/login');
});
app.get('/cityName', async (req, res) => {
    const cityKey = req.query.citykey;
    if (cityKey != undefined) {
        res.json({ 'vals': await fetchKijijiAutoData(cityKey) });
        return;
    }
    res.json({ 'error': 'No citykey is set.' });
});
app.post('/updateFilterHistoryName', async (req, res) => {
    const historyId = req.body.historyId;
    const newName = 'filter_history_' + req.body.historyName;
    if (historyId.indexOf('filter_history_') !== 0 || !req.body.historyName) {
        return res.json({ 'error': 'Invalid Name' });
    }
    await update_filter_history_name(historyId, newName);

    res.json({ 'success': true });
});
app.post('/updateModelTrim', async (req, res) => {
    const makes = req.body.makes;
    const models = req.body.models;

    filters.make = [];
    filters.model = [];
    filters.trim = [];
    filters.model_data = undefined;
    filters.trim_data = undefined;

    if (makes != undefined && makes.length !== 0) {
        filters.make = filters.make.concat(makes);

        try {
            //------------------- select/choose "make" checkboxes
            let scriptMake = `document.querySelector('#MAKE_MODEL #make').click();document.querySelector('#MAKE_MODEL [data-testid="MakeFilterDesktopMenu"] button span').click();`;
            for (let i = 0; i < filters.make.length; i++) {
                scriptMake += `document.querySelector('#MAKE_MODEL [name="` + filters.make[i] + `"]').parentElement.parentElement.children[1].click();`;
            }
            scriptMake += `document.querySelector('#MAKE_MODEL [data-testid="ApplyButton"]').click();`;
            await myBrowser.page.evaluate(scriptMake);
            await myBrowser.page.waitForTimeout(10);

            //-------------------- get select "model" elements
            filters.model_data = await myBrowser.page.evaluate(() => {
                var els = document.querySelectorAll('#MAKE_MODEL [data-testid="ModelFilterDesktopMenu"] li input');
                var arr = [];
                for (var i = 0; i < els.length; i++) {
                    arr.push(els[i].getAttribute("name"));
                }
                return arr;
            });
        } catch (err) {
            console.log(err);
        }

        if (models != undefined && models.length !== 0) {
            filters.model = filters.model.concat(models);

            //------------------- select/choose "model" checkboxes
            try {
                let scriptModel = `document.querySelector('#MAKE_MODEL #model').click(); document.querySelector('#MAKE_MODEL [data-testid="ModelFilterDesktopMenu"] button span').click();`;
                for (let i = 0; i < filters.model.length; i++) {
                    scriptModel += `document.querySelector('#MAKE_MODEL  [data-testid="ModelFilterDesktopMenu"] [name="` + filters.model[i] + `"]').parentElement.parentElement.children[1].click();`;
                }
                scriptModel += `document.querySelector('#MAKE_MODEL  [data-testid="ModelFilterDesktopMenu"] [data-testid="ApplyButton"]').click();`;
                await myBrowser.page.evaluate(scriptModel);
                await myBrowser.page.waitForTimeout(10);

                //------------------- get "trim" data
                filters.trim_data = await myBrowser.page.evaluate(() => {
                    var els = document.querySelectorAll('[data-testid="TrimFilterDesktopMenu"] li input');
                    var arr = [];
                    for (var i = 0; i < els.length; i++) {
                        arr.push(els[i].getAttribute("name"));
                    }
                    return arr;
                });
            } catch (err) {
                console.log(err);
            }
        }
        return res.json({ 'success': true, model_data: filters.model_data, trim_data: filters.trim_data });
    }
    return res.json({ 'success': false, 'message': 'No make is set.' });
});
app.get('/', (req, res, next) => {
    const token = req.cookies.token;
    // Verify and decode the token as needed
    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
            // Token is invalid or expired, handle accordingly
            res.redirect('/login');
        } else {
            // Token is valid, you can access decoded data
            const userId = decoded.id;
            // Your protected route logic here
            next();

        }
    });

}, async (req, res) => {
    await processPageActions(req);
    res.render('search', { filters: filters, def_msg: def_msg });
});
app.post("/", (req, res, next) => {
    const token = req.cookies.token;
    // Verify and decode the token as needed
    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
            // Token is invalid or expired, handle accordingly
            res.redirect('/login');
        } else {
            // Token is valid, you can access decoded data
            const userId = decoded.id;
            // Your protected route logic here
            next();

        }
    });

}, async (req, res) => {
    await processPageActions(req);

    //start queue processing if not already started
    start_queue_processing();//its meant to not use await

    res.render('search', { filters: filters, def_msg: def_msg });
});
const login_db_key = 'user_login';

async function processPageActions(req) {
    /**  ----------------- filters -----------------------
        * 1- Make
        * 2- Model
        * 3- Trim
        * 4- year from
        * 5- year to
        * 6- price
        * 7- Transmission
        * 8- Kilometres
        * 9- Body type
        * 10- Condition
        * 11- Fuel type
        * 12- Drivetrain
        * 13- Seller type
        * 14- Exterior colour
        * 15- Number of cylinders
        * 16- Engine size
        * 17- Power
        * 18- Seat count
        * 19- Doors
        * 20- Video/photos
        * 21- location (province)
        **/

    try {
        while (myBrowser.page == undefined || myBrowser.page === false) {
            await sleep(1000);
        }
        const page = myBrowser.page;

        /*const url = await page.url();

        if (url != main_page_url && req.body.conv_msg == undefined && req.body.start_conversation == undefined) {
            await page.goto(main_page_url);
            await page.waitForTimeout(1000);
            await page.waitForSelector('[data-testid="AdvancedSearchButton"]');
        }*/

        let filter_db_key = 'filters';
        const small_wait = 10;


        //load filters
        if (req.body.loadFilters) {
            if (req.body.loadFilters.indexOf('filter_history_') === 0) {
                filter_db_key = req.body.loadFilters;
            } else {
                myBrowser.reseetResultsArray();
                await myBrowser.page.goto(main_page_url);
            }
            filters = await get_options_by_name(filter_db_key);
            if (!filters) {
                filters = {};
            }

            req.body.filtersForm = filters.filtersForm;
            req.body.filter_make = filters.make;
            req.body.year_from_data = filters.year_from_data;
            req.body.year_to_data = filters.year_to_data;
            req.body.year_to = filters.year_to;
            req.body.year_from = filters.year_from;
            req.body.price_from = filters.price_from;
            req.body.price_to = filters.price_to;
            req.body.tran_manual = filters.tran_manual;
            req.body.tran_automatic = filters.tran_automatic;
            req.body.Kilometres_from = filters.Kilometres_from;
            req.body.Kilometres_to = filters.Kilometres_to;
            req.body.body_type = filters.body_type;
            req.body.cond_used = filters.cond_used;
            req.body.cond_new = filters.cond_new;
            req.body.cond_cer_pre_owned = filters.cond_cer_pre_owned;
            req.body.fuel_gas = filters.fuel_gas;
            req.body.fuel_diesel = filters.fuel_diesel;
            req.body.fuel_electric = filters.fuel_electric;
            req.body.fuel_hybrid = filters.fuel_hybrid;
            req.body.fuel_other = filters.fuel_other;
            req.body.drv_four_wheel = filters.drv_four_wheel;
            req.body.drv_all_wheel = filters.drv_all_wheel;
            req.body.drv_front_wheel = filters.drv_front_wheel;
            req.body.drv_rear_wheel = filters.drv_rear_wheel;
            req.body.drv_other = filters.drv_other;
            req.body.slr_dealer = filters.slr_dealer;
            req.body.slr_private = filters.slr_private;
            req.body.cylinders_from = filters.cylinders_from;
            req.body.cylinders_to = filters.cylinders_to;
            req.body.engin_size_from = filters.engin_size_from;
            req.body.engin_size_to = filters.engin_size_to;
            req.body.power_from = filters.power_from;
            req.body.power_to = filters.power_to;
            req.body.seat_from = filters.seat_from;
            req.body.seat_to = filters.seat_to;
            req.body.doors_two_or_three = filters.doors_two_or_three;
            req.body.doors_four_or_five = filters.doors_four_or_five;
            req.body.with_video = filters.with_video;
            req.body.with_photo = filters.with_photo;
            req.body.filter_location = filters.location;
            req.body.filter_radius = filters.radius;
            req.body.limit_radius = filters.limit_radius;
            req.body.carfax = filters.carfax;
        }
        if (req.body.logout != undefined && filters.isLogedin == true) {
            //logout
            await myBrowser.page.goto('https://www.kijijiautos.ca/');
            await myBrowser.page.waitForSelector(('[data-testid="navigation-menu-logout"]'));

            await myBrowser.page.evaluate(() => {
                var els = document.querySelectorAll('[data-testid="navigation-menu-logout"]');
                if (els.length > 0) {
                    els[0].click();
                }
            });
            //delete login data from db
            await remove_option_from_db(login_db_key);

            //done login
            filters.isLogedin = false;
            filters.isLoginNeeded = true;
            filters.loginErrorMsg = undefined;
        }

        //make login needed by default
        if (filters.isLoginNeeded == undefined && req.body.reset == undefined) {
            try {
                await page.waitForSelector('[data-testid="navigation-menu-login"]', { timeout: 1500 });
            } catch (err) {
                console.log(err);
            }
            //check if we are logged in
            const isloggedin = await page.evaluate(() => {
                var els = document.querySelectorAll('[data-testid="navigation-menu-login"]');
                if (els.length > 0) {
                    return els[0].innerText != 'Sign in';
                }
                var els2 = document.querySelectorAll('[data-testid="buttons-logged-in-navigation-button"]');
                return els2.length > 0;
            });

            if (!isloggedin) {
                filters.isLoginNeeded = true;

                //get data from database
                const data = await get_options_by_name(login_db_key);
                if (data && data.uname) {
                    req.body.start_login = true;
                    req.body.upass = data.upass;
                    req.body.uname = data.uname;
                }
            }
        } else if (req.body.remember_me != undefined) {
            await save_option_to_db(login_db_key, { uname: req.body.uname, upass: req.body.upass });
        }


        if (req.body.back_to_search_results == undefined) {
            //--------------- trying to start a conversation
            if (req.body.start_conversation != undefined) {
                filters.start_conversation = req.body.start_conversation;
                if (filters.results != undefined) {
                    for (let i = 0; i < filters.results.length; i++) {
                        if (filters.results[i].url == req.body.start_conversation) {
                            filters.start_conversation = filters.results[i];
                        }
                    }
                }
                await myBrowser.page.goto(req.body.start_conversation);
                await myBrowser.page.waitForSelector('[data-testid="OpenContactForm"]');

                if (filters.isLogedin == undefined) {
                    filters.isLoginNeeded = await myBrowser.page.evaluate(() => {
                        return document.querySelectorAll('#phoneInquery').length == 0;
                    });
                    filters.messageType = filters.isLoginNeeded ? "singleText" : "fullForm";
                }
            }
            //--------------- trying to login
            if (req.body.start_login != undefined) {
                //click on login menu item
                // await myBrowser.page.evaluate(() => {
                //     var els = document.querySelectorAll('[data-testid="navigation-menu-login"]');
                //     if (els.length > 0) {
                //         els[0].click();
                //     }
                // });

                await myBrowser.page.click('[data-testid="navigation-menu-login"]');
                await myBrowser.page.waitForNavigation();

                await myBrowser.page.waitForSelector('#username', { timeout: 60000 });

                await myBrowser.page.evaluate(`document.querySelector('#username').value = "` + req.body.uname + `";
                                                document.querySelector('#password').value = "`+ req.body.upass + `";
                                                document.querySelector('#login-submit').click();`);

                await myBrowser.page.waitForNavigation();
                await myBrowser.page.waitForTimeout(2000);

                const loginErrorMsg = await myBrowser.page.evaluate(() => {
                    var els = document.querySelectorAll('.form-element.errors');
                    if (els.length == 0) {
                        els = document.querySelectorAll('.error-message');
                    }
                    if (els.length > 0) {
                        return els[0].innerText;
                    }
                    return '';
                });

                if (loginErrorMsg != '') {
                    filters.loginErrorMsg = loginErrorMsg;
                    //login error
                } else {
                    await myBrowser.page.waitForSelector('[data-testid="buttons-logged-in-navigation-button"]');
                    //done login
                    
                    filters.isLogedin = true;
                    filters.isLoginNeeded = false;
                    filters.loginErrorMsg = undefined;
                    await save_option_to_db(login_db_key, { uname: req.body.uname, upass: req.body.upass });

                }
            }
            //trying to send messgae
            if (req.body.send_message != undefined) {
                filters.conversation_data = { msg: req.body.conv_msg };

                //click on try again if exist
                await myBrowser.page.evaluate(() => {
                    var retryBtn = document.querySelector('[data-testid="SendAgainButton"]');
                    if (retryBtn !== undefined && retryBtn != null) {
                        retryBtn.click();
                    }
                });
                await myBrowser.page.waitForTimeout(1000);

                await myBrowser.page.evaluate(`var el = document.querySelectorAll('[data-testid="MessageButton"]');if(el.length>0){el[0].click()}`);

                //clear old text
                // await myBrowser.page.evaluate(`var el = document.querySelector('#messageInquery');if(el != undefined){el.innerText="";el.value='';}`);
                await clearValue(myBrowser.page, '#messageInquery');
                await myBrowser.page.type('#messageInquery', req.body.conv_msg, { delay: 1, clear: true });


                if (filters.messageType == "fullForm") {

                    // await myBrowser.page.evaluate(`document.querySelector('#nameInquery').value = '';`);
                    if (await isExist(myBrowser.page, '#nameInquery')) {
                        await clearValue(myBrowser.page, '#nameInquery');
                        await myBrowser.page.type('#nameInquery', req.body.fullName, { delay: 5, clear: true });
                        filters.conversation_data.fullName = req.body.fullName;

                    }
                    // await myBrowser.page.evaluate(`document.querySelector('#emailInquery').value = '';`);
                    if (await isExist(myBrowser.page, '#emailInquery')) {
                        await clearValue(myBrowser.page, '#emailInquery');
                        await myBrowser.page.type('#emailInquery', req.body.emailAddress, { delay: 5, clear: true });
                        filters.conversation_data.emailAddress = req.body.emailAddress;
                    }
                    // await myBrowser.page.evaluate(`document.querySelector('#phoneInquery').value = '';`);
                    if (await isExist(myBrowser.page, '#phoneInquery')) {
                        await clearValue(myBrowser.page, '#phoneInquery');
                        await myBrowser.page.type('#phoneInquery', req.body.phone, { delay: 5, clear: true });
                        filters.conversation_data.phone = req.body.phone;
                    }

                    filters.conversation_data.financing = '';
                    await myBrowser.page.evaluate(`var el = document.querySelector('label[for="financing-ocf"] input');if(el!=undefined && el.checked){el.parentElement.click();}`)
                    if (req.body.financing != undefined) {
                        await myBrowser.page.evaluate(`var el = document.querySelector('label[for="financing-ocf"]');if(el != undefined){el.click();}`);
                        filters.conversation_data.financing = req.body.financing;
                    }
                    filters.conversation_data.testDrive = '';
                    await myBrowser.page.evaluate(`var el = document.querySelector('label[for="testDrive-ocf"] input');if(el!=undefined && el.checked){el.parentElement.click();}`)
                    if (req.body.testDrive != undefined) {
                        await myBrowser.page.evaluate(`var el = document.querySelector('label[for="testDrive-ocf"]');if(el != undefined){el.click();}`);
                        filters.conversation_data.testDrive = req.body.testDrive;
                    }
                    filters.conversation_data.trading = '';
                    await myBrowser.page.evaluate(`var el = document.querySelector('label[for="modalTradeIn-ocf"] input');if(el!=undefined && el.checked){el.parentElement.click();}`)
                    if (req.body.trading != undefined) {
                        await myBrowser.page.evaluate(`var el = document.querySelector('label[for="modalTradeIn-ocf"]');if(el != undefined){el.click();}`);
                        filters.conversation_data.trading = req.body.trading;
                    }

                }
                await myBrowser.page.waitForTimeout(1000);

                //click send message button or get validation error if any
                filters.sending_msg_errors = await myBrowser.page.evaluate(() => {
                    var retryBtn = document.querySelector('[data-testid="SendAgainButton"]');
                    if (retryBtn !== undefined && retryBtn != null) {
                        retryBtn.click();
                    }
                    var btn = document.querySelector('[data-testid="OpenContactFormSendButton"]');
                    if (btn == undefined || btn == null) {
                        btn = document.querySelector('[data-testid="SendContactFormInfoButton"]');
                    }
                    if (btn.disabled) {
                        //phoneInquery-errorMessage
                        //emailInquery-errorMessage
                        var err1 = document.querySelector('#emailInquery-errorMessage');
                        var err2 = document.querySelector('#phoneInquery-errorMessage');

                        var msg = '';
                        if (err1 != undefined) {
                            msg += err1.innerText;
                        }
                        if (err2 != undefined) {
                            msg += ', ' + err2.innerText;
                        }
                        return msg == '' ? 'Error: Please make sure all input fields are correct.' : msg;
                    }
                    btn.click();
                    return '';
                });

                try {
                    await myBrowser.page.waitForTimeout(2000);
                    await myBrowser.page.waitForSelector('[data-testid="ContactFormModalMessageSent"]');
                } catch (err) {
                    console.error("error when waiting after conversation", err);
                }
                await myBrowser.page.waitForTimeout(5000);
                await myBrowser.page.screenshot({path: 'screenshot_after_sending_msg.png'});

                filters.send_feedback = await myBrowser.page.evaluate(() => {
                    //data-testid="ContactFormModalMessageSent"
                    var el = document.querySelector('[data-testid="ContactFormModalMessageSent"]');
                    if (el == undefined) {
                        el = document.querySelector('[data-testid="OpenContactForm"]');
                    }
                    if (el != undefined) {
                        return el.innerText;
                    } else {
                        return 'Something went wrong'
                    }
                });

                if (filters.send_feedback != undefined && filters.send_feedback.indexOf("Message was sent") != -1) {

                    //get ad id
                    const url = filters.start_conversation.url;
                    const idx = url.indexOf('/vip/') + 5;
                    const ad_id = url.substr(idx);


                    await save_message_to_db(ad_id, filters.conversation_data, filters.start_conversation);
                }
            }
        } else {
            filters.start_conversation = undefined;
            filters.send_feedback = undefined;
        }
        //if search is done and there is results then show the results only
        if (filters.results != undefined && req.body.reset == undefined) {
            console.log(filters);

        } else if (filters.isLogedin == true) {//else if there is no search done yet and user is logged in

            if (req.body.reset != undefined) {
                myBrowser.reseetResultsArray();
                filters = { make: [] };
                filters.isLogedin = true;
                filters.isLoginNeeded = false;

                await myBrowser.page.goto(main_page_url);
                await myBrowser.page.waitForTimeout(1000);


            }
            try {
                const url = await myBrowser.page.url();

                if (url != main_page_url && req.body.conv_msg == undefined && req.body.start_conversation == undefined) {
                    await myBrowser.page.goto(main_page_url);
                    await myBrowser.page.waitForTimeout(1000);
                    await myBrowser.page.waitForSelector('[data-testid="AdvancedSearchButton"]');
                }
                await myBrowser.page.evaluate(`var el = document.querySelector('[data-testid="AdvancedSearchButton"]');
                                                if(typeof el != "undefined" && el != null){
                                                    el.click();
                                                }
                                                var els = document.querySelectorAll('[data-testid="DetailSearchModalForm"] button span');
                                                for(var i=0;i<els.length;i++){
                                                    if(els[i].innerText == "Show more filters"){
                                                        els[i].click();
                                                    }
                                                }`);
                if (filters.make_data == undefined) {
                    let make_data = await myBrowser.page.evaluate(() => {
                        return document.querySelector('#make').innerText.replaceAll('\n', ',')
                    });
                    filters.make_data = make_data.split(',');
                    //make array have unique values #https://stackoverflow.com/questions/9229645/remove-duplicate-values-from-js-array
                    filters.make_data = [...new Set(filters.make_data)];
                }
            } catch (err) {
                console.log(err);
            }
            if (req.body.show_results == "show") {

                await save_filters_history(filters);

                await myBrowser.page.evaluate(`document.querySelector('[data-testid="AllFiltersResultButton"]').click();`);

                await myBrowser.page.waitForSelector('[data-testid="ListItemPage-0"]');

                //rslt variable is not used, myBrowser.getResultsArray is getting API results directly
                let rslt = await get_results(myBrowser.page);
                
                await myBrowser.page.waitForTimeout(2000);

                const rslt_arr_tmp = myBrowser.getResultsArray();

                let rslt_arr = [];
                for (let i = 0; i < rslt_arr_tmp.length; i++) {
                    const data = JSON.parse(rslt_arr_tmp[i]);
                    if (data != undefined) {
                        const listings = data.listings;
                        if (listings != null && listings != undefined && listings.items != undefined && listings.items.length > 0) {
                            for (let j = 0; j < listings.items.length; j++) {
                                const item = listings.items[j];

                                var containsAdId = rslt_arr.some(function(carItem) {
                                    return carItem.url === item.url;
                                });
                                if (containsAdId) {
                                    continue;
                                }

                                let carfax_status = "undefined";
                                if (item.badges.length > 0) {
                                    for (let j = 0; j < item.badges.length; j++) {
                                        if (item.badges[j].label && item.badges[j].label == 'Free CARFAX Report') {
                                            carfax_status = "free";
                                            break;
                                        } else {
                                            carfax_status = "request";
                                        }
                                    }
                                } else {
                                    carfax_status = "request";
                                }

                                if (filters.carfax != 'all' && ((filters.carfax == 'free' && carfax_status != 'free') || (filters.carfax == 'request' && carfax_status != 'request'))) continue;

                                let price = "-";
                                let currency = "";
                                if (item.prices.consumerPrice != undefined) {
                                    price = item.prices.consumerPrice.localized;
                                    currency = item.prices.consumerPrice.currency;
                                }
                                const obj = {
                                    title: item.title,
                                    description: item.description,
                                    date_posted: getReadableDate(item.created),
                                    url: item.url,
                                    condition: item.condition,
                                    trim: item.trim,
                                    images: item.images,
                                    km: item.attr.ml,
                                    drivetrain: item.attr.dt,
                                    transmission: item.attr.tr,
                                    fuel: item.attr.tf,
                                    door: item.attr.door,
                                    //attr:item.attr,
                                    listingStatus: item.listingStatus,
                                    price: price,
                                    currency: currency,
                                };

                                rslt_arr.push(obj);
                            }
                        }
                    }
                }
                //console.log(rslt_arr);
                filters.results = rslt_arr;
            }
            if (req.body.filter_make) {//if filter_make form is submitted
                await myBrowser.page.waitForSelector('#MAKE_MODEL');

                filters.make = [];
                filters.make = filters.make.concat(req.body.filter_make);

                //------------------- select/choose "make" checkboxes
                let script = `document.querySelector('#MAKE_MODEL #make').click();document.querySelector('#MAKE_MODEL [data-testid="MakeFilterDesktopMenu"] button span').click();`;
                for (let i = 0; i < filters.make.length; i++) {
                    script += `document.querySelector('#MAKE_MODEL [name="` + filters.make[i] + `"]').parentElement.parentElement.children[1].click();`;
                }
                script += `document.querySelector('#MAKE_MODEL [data-testid="ApplyButton"]').click();`;
                await myBrowser.page.evaluate(script);

                //-------------------- get select "model" elements
                filters.model_data = await myBrowser.page.evaluate(() => {
                    var els = document.querySelectorAll('#MAKE_MODEL [data-testid="ModelFilterDesktopMenu"] li input');
                    var arr = [];
                    for (var i = 0; i < els.length; i++) {
                        arr.push(els[i].getAttribute("name"));
                    }
                    return arr;
                });
                await myBrowser.page.waitForTimeout(small_wait);
            } else if (req.body.filtersForm) {
                await myBrowser.page.waitForSelector('#MAKE_MODEL');
                //clear selected make
                await myBrowser.page.evaluate(() => {
                    try {
                        document.querySelector('#MAKE_MODEL [data-testid="ApplyButton"]').click();
                        document.querySelector('#MAKE_MODEL [data-testid="ApplyButton"]').parentElement.children[0].click();
                        document.querySelector('#MAKE_MODEL [data-testid="ApplyButton"]').click();
                    } catch (err) {
                        console.log(err);
                    }
                });
                filters.make = [];
                filters.model = [];
                filters.model_data=undefined;
                filters.trim = [];
                filters.trim_data=undefined
            }
            //carfax
            if (req.body.carfax != undefined) {
                filters.carfax = req.body.carfax;
            }
            if (req.body.reset != undefined) {

                //------ clear location
                await myBrowser.page.waitForSelector('form[data-testid="DetailSearchModalForm"] button[data-testid="LocationLabelLink"]');

                await myBrowser.page.evaluate(() => {
                    //show location msg
                    var els = document.querySelectorAll('form[data-testid="DetailSearchModalForm"] button[data-testid="LocationLabelLink"]');
                    if (els.length > 0) {
                        els[0].click();
                    }
                    els = document.querySelectorAll('[data-testid="LocationHeaderResetButton"]');
                    if (els.length > 0) {
                        els[0].click();
                    }
                    els = document.querySelectorAll('button[data-testid="LocationModalSubmitButton"]');
                    if (els.length > 0) {
                        els[0].click();
                    }
                });
            }
            if (req.body.filter_make && req.body.filter_model) {//if filter_model form is submitted
                filters.model = [];
                filters.model = filters.model.concat(req.body.filter_model);

                //------------------- select/choose "model" checkboxes
                let script = `document.querySelector('#MAKE_MODEL #model').click(); document.querySelector('#MAKE_MODEL [data-testid="ModelFilterDesktopMenu"] button span').click();`;
                for (let i = 0; i < filters.model.length; i++) {
                    script += `document.querySelector('#MAKE_MODEL  [data-testid="ModelFilterDesktopMenu"] [name="` + filters.model[i] + `"]').parentElement.parentElement.children[1].click();`;
                }
                script += `document.querySelector('#MAKE_MODEL  [data-testid="ModelFilterDesktopMenu"] [data-testid="ApplyButton"]').click();`;
                await myBrowser.page.evaluate(script);

                //------------------- get "trim" data
                filters.trim_data = await myBrowser.page.evaluate(() => {
                    var els = document.querySelectorAll('[data-testid="TrimFilterDesktopMenu"] li input');
                    var arr = [];
                    for (var i = 0; i < els.length; i++) {
                        arr.push(els[i].getAttribute("name"));
                    }
                    return arr;
                });
                await myBrowser.page.waitForTimeout(small_wait);

            } else if (req.body.filtersForm) {
                await myBrowser.page.waitForSelector('#MAKE_MODEL');
                //clear selected modal
                await myBrowser.page.evaluate(() => {
                    try {
                        document.querySelector('#MAKE_MODEL #model').click(); document.querySelector('#MAKE_MODEL [data-testid="ModelFilterDesktopMenu"] button span').click();
                        document.querySelector('#MAKE_MODEL  [data-testid="ModelFilterDesktopMenu"] [data-testid="ApplyButton"]').parentElement.children[0].click();
                        document.querySelector('#MAKE_MODEL  [data-testid="ModelFilterDesktopMenu"] [data-testid="ApplyButton"]').click();
                    } catch (err) {
                        console.log(err);
                    }
                });
                filters.model = [];
                filters.trim = [];
                filters.trim_data=undefined;
            }

            // ---------------- trim
            if (req.body.filter_make && req.body.filter_model && req.body.filter_trim) {//if trim_data form is submitted
                filters.trim = [];
                filters.trim = filters.trim.concat(req.body.filter_trim);

                //------------------- select/choose "trim" checkboxes
                let script = `document.querySelector('#trim').click();document.querySelector('#MAKE_MODEL [data-testid="TrimFilterDesktopMenu"] button span').click();`;
                for (let i = 0; i < filters.trim.length; i++) {
                    script += `document.querySelector('#MAKE_MODEL [data-testid="TrimFilterDesktopMenu"] [name="` + filters.trim[i] + `"]').parentElement.parentElement.children[1].click();`;
                }
                script += `document.querySelector('#MAKE_MODEL [data-testid="TrimFilterDesktopMenu"] [data-testid="ApplyButton"]').click();`;
                // console.log(script);
                await myBrowser.page.evaluate(script);
                await myBrowser.page.waitForTimeout(small_wait);
            } else if (req.body.filtersForm) {
                await myBrowser.page.waitForSelector('#MAKE_MODEL');
                //clear selected modal
                await myBrowser.page.evaluate(() => {
                    try {
                        document.querySelector('#trim').click(); document.querySelector('#MAKE_MODEL [data-testid="TrimFilterDesktopMenu"] button span').click();
                        document.querySelector('#MAKE_MODEL  [data-testid="TrimFilterDesktopMenu"] [data-testid="ApplyButton"]').parentElement.children[0].click();
                        document.querySelector('#MAKE_MODEL  [data-testid="TrimFilterDesktopMenu"] [data-testid="ApplyButton"]').click();
                    } catch (err) {
                        console.log(err);
                    }
                });
                filters.trim = [];
            }

            //------------------- get "year from" & "year to" data
            if (filters.year_from_data == undefined || filters.year_from_data.length == 0) {
                filters.year_from_data = await myBrowser.page.evaluate(() => {
                    var els = document.querySelectorAll('#CONSTRUCTION_YEAR-from option');//id="CONSTRUCTION_YEAR-from"
                    var arr = [];
                    for (var i = 0; i < els.length; i++) {
                        arr.push(els[i].innerText);
                    }
                    return arr;
                });
            }
            if (filters.year_to_data == undefined || filters.year_to_data.length == 0) {
                filters.year_to_data = await myBrowser.page.evaluate(() => {
                    var els = document.querySelectorAll('#CONSTRUCTION_YEAR-to option');//id="CONSTRUCTION_YEAR-from"
                    var arr = [];
                    for (var i = 0; i < els.length; i++) {
                        arr.push(els[i].innerText);
                    }
                    return arr;
                });
            }

            if (req.body.year_from_data) {//if year_from_data form is submitted
                filters.year_from = 'Min';
                if (typeof req.body.year_from_data == 'string') {
                    filters.year_from = req.body.year_from_data;
                } else if (typeof req.body.year_from) {
                    filters.year_from = req.body.year_from;
                }
                //------------------- select/choose "year_from" checkboxes
                let script = `document.querySelector('#CONSTRUCTION_YEAR-from').click();
            var els = document.querySelectorAll("[data-testid=CONSTRUCTION_YEAR-RangeDropdown-minDesktopMenu] li");
            for(var i=0;i<els.length;i++){
            if(els[i].innerText == "`+ filters.year_from + `"){
            els[i].click();break;
            }
        }`;
                await myBrowser.page.evaluate(script);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            if (req.body.year_to_data) {//if year_to_data form is submitted
                filters.year_to = 'Max';
                if (typeof req.body.year_to_data == 'string') {
                    filters.year_to = req.body.year_to_data;
                } else if (typeof req.body.year_to) {
                    filters.year_to = req.body.year_to;
                }
                //------------------- select/choose "year_to" checkboxes
                let script = `document.querySelector('#CONSTRUCTION_YEAR-to').click();
            var els = document.querySelectorAll("[data-testid=CONSTRUCTION_YEAR-RangeDropdown-maxDesktopMenu] li");
            for(var i=0;i<els.length;i++){
            if(els[i].innerText == "`+ filters.year_to + `"){
            els[i].click();break;
            }
        }`;
                await myBrowser.page.evaluate(script);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            //----------- price
            if (req.body.price_from) {//if price_from form is submitted
                filters.price_from = req.body.price_from;
                await clearValue(myBrowser.page, '#PRICE-from');
                await myBrowser.page.type('#PRICE-from', filters.price_from, { delay: 20, clear: true });
                await myBrowser.page.waitForTimeout(small_wait);
            } else if (req.body.filtersForm) {
                await clearValue(myBrowser.page, '#PRICE-from');
                filters.price_from = undefined;
            }

            if (req.body.price_to) {//if price_to form is submitted
                filters.price_to = req.body.price_to;
                await clearValue(myBrowser.page, '#PRICE-to');
                await myBrowser.page.type('#PRICE-to', filters.price_to, { delay: 20, clear: true });
                // await myBrowser.page.evaluate(`document.querySelector("#PRICE-to").value =` + filters.price_to);
                await myBrowser.page.waitForTimeout(small_wait);
            } else if (req.body.filtersForm) {
                await clearValue(myBrowser.page, '#PRICE-to');
                filters.price_to = undefined;
            }
            //---------------- transition
            if (req.body.tran_manual) {//if tran_manual form is submitted
                filters.tran_manual = req.body.tran_manual == "0" ? "0" : "1";

                await myBrowser.page.evaluate(`if(document.querySelector("#tr-manual").checked != ` + (filters.tran_manual == "1") + `){
        document.querySelector("#tr-manual").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }

            if (req.body.tran_automatic) {//if tran_automatic form is submitted
                filters.tran_automatic = req.body.tran_automatic == "0" ? "0" : "1";
                await myBrowser.page.evaluate(`if(document.querySelector("#tr-automatic").checked != ` + (filters.tran_automatic == "1") + `){
        document.querySelector("#tr-automatic").parentElement.click();
    }`);
            }
            //--------------- kilometres
            if (req.body.Kilometres_from) {//if Kilometres_from form is submitted
                filters.Kilometres_from = req.body.Kilometres_from;
                await clearValue(myBrowser.page, '#MILEAGE-from');
                await myBrowser.page.type('#MILEAGE-from', filters.Kilometres_from, { delay: 20, clear: true });
                // await myBrowser.page.evaluate(`document.querySelector("#MILEAGE-from").value =` + filters.Kilometres_from);
                await myBrowser.page.waitForTimeout(small_wait);
            } else if (req.body.filtersForm) {
                await clearValue(myBrowser.page, '#MILEAGE-from');
                filters.Kilometres_from = undefined;
            }

            if (req.body.Kilometres_to) {//if Kilometres_to form is submitted
                filters.Kilometres_to = req.body.Kilometres_to;
                await clearValue(myBrowser.page, '#MILEAGE-to');
                await myBrowser.page.type('#MILEAGE-to', filters.Kilometres_to, { delay: 20, clear: true });
                // await myBrowser.page.evaluate(`document.querySelector("#MILEAGE-to").value =` + filters.Kilometres_to);
                await myBrowser.page.waitForTimeout(small_wait);
            } else if (req.body.filtersForm) {
                await clearValue(myBrowser.page, '#MILEAGE-to');
                filters.Kilometres_to = undefined;
            }
            //------------ body type
            if (req.body.body_type) {
                filters.body_type = req.body.body_type;
                if (typeof filters.body_type == 'string') {
                    filters.body_type = [filters.body_type];
                }
                let script = `//un check all before selecting
                            var els = document.querySelectorAll('[name="c"]');
                            for(var i=0;i<els.length;i++){
                                if(els[i].checked){
                                    els[i].click();
                                }
                            }`;
                for (let i = 0; i < filters.body_type.length; i++) {
                    script += `
                            //select the choosen ones
                            if(!document.querySelector('[value="`+ filters.body_type[i] + `"]').checked){
                                document.querySelector('[value="`+ filters.body_type[i] + `"]').click();
                            }`;
                }
                await myBrowser.page.evaluate(script);
                await myBrowser.page.waitForTimeout(small_wait);
            } else if (req.body.filtersForm) {
                let script = `//un check all before selecting
                            var els = document.querySelectorAll('[name="c"]');
                            for(var i=0;i<els.length;i++){
                                if(els[i].checked){
                                    els[i].click();
                                }
                            }`;
                await myBrowser.page.evaluate(script);
                await myBrowser.page.waitForTimeout(small_wait);
                filters.body_type = undefined;
            }
            //---------------- Condition
            if (req.body.cond_used) {//if cond_used form is submitted
                filters.cond_used = req.body.cond_used == "0" ? "0" : "1";

                await myBrowser.page.evaluate(`if(document.querySelector("#con-used").checked != ` + (filters.cond_used == "1") + `){
        document.querySelector("#con-used").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }

            if (req.body.cond_new) {//if cond_new form is submitted
                filters.cond_new = req.body.cond_new == "0" ? "0" : "1";
                await myBrowser.page.evaluate(`if(document.querySelector("#con-new").checked != ` + (filters.cond_new == "1") + `){
        document.querySelector("#con-new").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }

            if (req.body.cond_cer_pre_owned) {//if cond_cer_pre_owned form is submitted
                filters.cond_cer_pre_owned = req.body.cond_cer_pre_owned == "0" ? "0" : "1";
                await myBrowser.page.evaluate(`if(document.querySelector("#con-certified_pre_owned").checked != ` + (filters.cond_cer_pre_owned == "1") + `){
        document.querySelector("#con-certified_pre_owned").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            //---------------- Fuel type
            if (req.body.fuel_gas) {
                filters.fuel_gas = req.body.fuel_gas == "0" ? "0" : "1";

                await myBrowser.page.evaluate(`if(document.querySelector("#ft-gas").checked != ` + (filters.fuel_gas == "1") + `){
        document.querySelector("#ft-gas").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            if (req.body.fuel_diesel) {
                filters.fuel_diesel = req.body.fuel_diesel == "0" ? "0" : "1";

                await myBrowser.page.evaluate(`if(document.querySelector("#ft-diesel").checked != ` + (filters.fuel_diesel == "1") + `){
        document.querySelector("#ft-diesel").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            if (req.body.fuel_electric) {
                filters.fuel_electric = req.body.fuel_electric == "0" ? "0" : "1";

                await myBrowser.page.evaluate(`if(document.querySelector("#ft-electric").checked != ` + (filters.fuel_electric == "1") + `){
        document.querySelector("#ft-electric").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            if (req.body.fuel_hybrid) {
                filters.fuel_hybrid = req.body.fuel_hybrid == "0" ? "0" : "1";

                await myBrowser.page.evaluate(`if(document.querySelector("#ft-hybrid").checked != ` + (filters.fuel_hybrid == "1") + `){
        document.querySelector("#ft-hybrid").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            if (req.body.fuel_other) {
                filters.fuel_other = req.body.fuel_other == "0" ? "0" : "1";

                await myBrowser.page.evaluate(`if(document.querySelector("#ft-other").checked != ` + (filters.fuel_other == "1") + `){
        document.querySelector("#ft-other").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }

            //-------------------- Drivetrain

            if (req.body.drv_four_wheel) {
                filters.drv_four_wheel = req.body.drv_four_wheel == "0" ? "0" : "1";

                await myBrowser.page.evaluate(`if(document.querySelector("#dt-four_wheel").checked != ` + (filters.drv_four_wheel == "1") + `){
        document.querySelector("#dt-four_wheel").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            if (req.body.drv_all_wheel) {
                filters.drv_all_wheel = req.body.drv_all_wheel == "0" ? "0" : "1";

                await myBrowser.page.evaluate(`if(document.querySelector("#dt-awd").checked != ` + (filters.drv_all_wheel == "1") + `){
        document.querySelector("#dt-awd").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            if (req.body.drv_front_wheel) {
                filters.drv_front_wheel = req.body.drv_front_wheel == "0" ? "0" : "1";

                await myBrowser.page.evaluate(`if(document.querySelector("#dt-fwd").checked != ` + (filters.drv_front_wheel == "1") + `){
        document.querySelector("#dt-fwd").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            if (req.body.drv_rear_wheel) {
                filters.drv_rear_wheel = req.body.drv_rear_wheel == "0" ? "0" : "1";

                await myBrowser.page.evaluate(`if(document.querySelector("#dt-rwd").checked != ` + (filters.drv_rear_wheel == "1") + `){
        document.querySelector("#dt-rwd").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            if (req.body.drv_other) {
                filters.drv_other = req.body.drv_other == "0" ? "0" : "1";

                await myBrowser.page.evaluate(`if(document.querySelector("#dt-other").checked != ` + (filters.drv_other == "1") + `){
        document.querySelector("#dt-other").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            //---------------------- Seller type
            if (req.body.slr_dealer) {
                filters.slr_dealer = req.body.slr_dealer == "0" ? "0" : "1";

                await myBrowser.page.evaluate(`if(document.querySelector("#st-dealer").checked != ` + (filters.slr_dealer == "1") + `){
        document.querySelector("#st-dealer").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            if (req.body.slr_private) {
                filters.slr_private = req.body.slr_private == "0" ? "0" : "1";

                await myBrowser.page.evaluate(`if(document.querySelector("#st-private_seller").checked != ` + (filters.slr_private == "1") + `){
        document.querySelector("#st-private_seller").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            //---------------------- Exterior colour
            if (req.body.ecol) {
                filters.ecol = req.body.ecol;
                if (typeof filters.ecol == 'string') {
                    filters.ecol = [filters.ecol];
                }
                let script = `//un check all before selecting
    var els = document.querySelectorAll('[name="ecol"]');
    for(var i=0;i<els.length;i++){
        if(els[i].checked){
            els[i].click();
        }
    }`;
                await myBrowser.page.waitForTimeout(small_wait);
                for (let i = 0; i < filters.ecol.length; i++) {
                    script += `
        //select the choosen ones
        if(!document.querySelector('[value="`+ filters.ecol[i] + `"]').checked){
            document.querySelector('[value="`+ filters.ecol[i] + `"]').click();
        }`;
                }
                await myBrowser.page.evaluate(script);
                await myBrowser.page.waitForTimeout(small_wait);
            } else if (req.body.filtersForm) {
                let script = `//un check all before selecting
                                var els = document.querySelectorAll('[name="ecol"]');
                                for(var i=0;i<els.length;i++){
                                    if(els[i].checked){
                                        els[i].click();
                                    }
                                }`;
                await myBrowser.page.evaluate(script);
                await myBrowser.page.waitForTimeout(small_wait);
                filters.ecol = undefined;
            }
            //---------------------- Number of cylinders
            if (req.body.cylinders_from) {//if cylinders_from form is submitted
                filters.cylinders_from = req.body.cylinders_from;
                const script = `document.querySelector('#CYLINDERS-from').click();
    var els = document.querySelectorAll('[data-testid="CYLINDERS-RangeDropdown-minDesktopMenu"] li');
    for(var i=0;i<els.length;i++){
        if(els[i].innerText.indexOf("`+ filters.cylinders_from + `") == 0){
            els[i].click();
        }
    }`;
                await myBrowser.page.evaluate(script);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            if (req.body.cylinders_to) {//if cylinders_to form is submitted
                filters.cylinders_to = req.body.cylinders_to;
                const script = `document.querySelector('#CYLINDERS-to').click();
    var els = document.querySelectorAll('[data-testid="CYLINDERS-RangeDropdown-maxDesktopMenu"] li');
    for(var i=0;i<els.length;i++){
        if(els[i].innerText.indexOf("`+ filters.cylinders_to + `") == 0){
            els[i].click();
        }
    }`;
                await myBrowser.page.evaluate(script);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            //---------------------- Engine size
            if (req.body.engin_size_from) {//if engin_size_from form is submitted
                filters.engin_size_from = req.body.engin_size_from;
                const script = `document.querySelector('#ENGINE_SIZE-from').click();
    var els = document.querySelectorAll('[data-testid="ENGINE_SIZE-RangeDropdown-minDesktopMenu"] li');
    for(var i=0;i<els.length;i++){
        if(els[i].innerText.indexOf("`+ filters.engin_size_from + `") == 0){
            els[i].click();
        }
    }`;
                await myBrowser.page.evaluate(script);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            if (req.body.engin_size_to) {//if engin_size_to form is submitted
                filters.engin_size_to = req.body.engin_size_to;
                const script = `document.querySelector('#ENGINE_SIZE-to').click();
    var els = document.querySelectorAll('[data-testid="ENGINE_SIZE-RangeDropdown-maxDesktopMenu"] li');
    for(var i=0;i<els.length;i++){
        if(els[i].innerText.indexOf("`+ filters.engin_size_to + `") == 0){
            els[i].click();
        }
    }`;
                await myBrowser.page.evaluate(script);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            //---------------------- Power
            if (req.body.power_from) {//if power_from form is submitted
                filters.power_from = req.body.power_from;
                const script = `document.querySelector('#POWER_IN_KW-from').click();
    var els = document.querySelectorAll('[data-testid="POWER_IN_KW-RangeDropdown-minDesktopMenu"] li');
    for(var i=0;i<els.length;i++){
        if(els[i].innerText.indexOf("`+ filters.power_from + `") == 0){
            els[i].click();
        }
    }`;
                await myBrowser.page.evaluate(script);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            if (req.body.power_to) {//if power_to form is submitted
                filters.power_to = req.body.power_to;
                const script = `document.querySelector('#POWER_IN_KW-to').click();
    var els = document.querySelectorAll('[data-testid="POWER_IN_KW-RangeDropdown-maxDesktopMenu"] li');
    for(var i=0;i<els.length;i++){
        if(els[i].innerText.indexOf("`+ filters.power_to + `") == 0){
            els[i].click();
        }
    }`;
                await myBrowser.page.evaluate(script);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            //---------------------- Seat count
            if (req.body.seat_from) {//if seat_from form is submitted
                filters.seat_from = req.body.seat_from;
                const script = `document.querySelector('#SEATS-from').click();
    var els = document.querySelectorAll('[data-testid="SEATS-RangeDropdown-minDesktopMenu"] li');
    for(var i=0;i<els.length;i++){
        if(els[i].innerText.indexOf("`+ filters.seat_from + `") == 0){
            els[i].click();
        }
    }`;
                await myBrowser.page.evaluate(script);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            if (req.body.seat_to) {//if seat_to form is submitted
                filters.seat_to = req.body.seat_to;
                const script = `document.querySelector('#SEATS-to').click();
    var els = document.querySelectorAll('[data-testid="SEATS-RangeDropdown-maxDesktopMenu"] li');
    for(var i=0;i<els.length;i++){
        if(els[i].innerText.indexOf("`+ filters.seat_to + `") == 0){
            els[i].click();
        }
    }`;
                await myBrowser.page.evaluate(script);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            //---------------------- Doors
            if (req.body.doors_two_or_three) {
                filters.doors_two_or_three = req.body.doors_two_or_three == "0" ? "0" : "1";

                await myBrowser.page.evaluate(`if(document.querySelector("#doors-TWO_OR_THREE").checked != ` + (filters.doors_two_or_three == "1") + `){
        document.querySelector("#doors-TWO_OR_THREE").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            if (req.body.doors_four_or_five) {
                filters.doors_four_or_five = req.body.doors_four_or_five == "0" ? "0" : "1";

                await myBrowser.page.evaluate(`if(document.querySelector("#doors-FOUR_OR_FIVE").checked != ` + (filters.doors_four_or_five == "1") + `){
        document.querySelector("#doors-FOUR_OR_FIVE").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            //---------------------- Video/photos
            if (req.body.with_video) {
                filters.with_video = req.body.with_video == "0" ? "0" : "1";

                await myBrowser.page.evaluate(`if(document.querySelector("#MEDIA-video").checked != ` + (filters.with_video == "1") + `){
        document.querySelector("#MEDIA-video").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            //---------------------- change location
            if (req.body.filter_location) {
                console.log("Filter locations:", req.body.filter_location);

                filters.location = req.body.filter_location;
                filters.radius = req.body.filter_radius;
                filters.limit_radius = req.body.limit_radius;

                //------ select location
                await myBrowser.page.evaluate(() => {
                    //show location msg
                    var els = document.querySelectorAll('form[data-testid="DetailSearchModalForm"] button[data-testid="LocationLabelLink"]');
                    if (els.length > 0) {
                        els[0].click();
                    }
                });
                await clearValue(myBrowser.page, '#LocationAutosuggest');
                await myBrowser.page.type('#LocationAutosuggest', filters.location, { delay: 20, clear: true });
                //choose location
                await myBrowser.page.waitForSelector('ul[data-testid="Autosuggest-Menu"] li');
                await myBrowser.page.evaluate(`document.querySelector('ul[data-testid="Autosuggest-Menu"] li').click();`);
                //choose radius
                await page.waitForTimeout(1000);
                await myBrowser.page.evaluate(`
                    document.querySelector('#rd').click();
                    var els = document.querySelectorAll('ul[data-testid="LocationRadiusDropdownDesktopMenu"] li');
                    for (var i = 0; i < els.length; i++) {
                        var txt = els[i].innerText;
                        txt = txt.replace(',', '');
                        if (txt.indexOf(" `+ filters.radius + ` ") != -1) {
                            els[i].click();
                            console.log("Found:", els[i]);
                        }
                    }`
                );
                //click on limit radius if needed
                await page.waitForTimeout(1000);
                if (filters.limit_radius) {
                    const isSelectRadiusLimit = filters.limit_radius == 'on';
                    await myBrowser.page.evaluate(`
                        if(document.querySelector('#limitedToProvince').checked != `+ isSelectRadiusLimit + `){
                            document.querySelector('#limitedToProvince').click();
                        }`
                    );
                }

                await page.waitForTimeout(2000);

                //apply location filters
                await myBrowser.page.evaluate(`document.querySelector('button[data-testid="LocationModalSubmitButton"]').click();`);

            } else {
                filters.location = undefined;
                filters.limit_radius = undefined;
                //------ clear location
                // await myBrowser.page.waitForSelector('form[data-testid="DetailSearchModalForm"] button[data-testid="LocationLabelLink"]');

                // await myBrowser.page.evaluate(() => {
                //     //show location msg
                //     var els = document.querySelectorAll('form[data-testid="DetailSearchModalForm"] button[data-testid="LocationLabelLink"]');
                //     if (els.length > 0) {
                //         els[0].click();
                //     }
                //     els = document.querySelectorAll('[data-testid="LocationHeaderResetButton"]');
                //     if (els.length > 0) {
                //         els[0].click();
                //     }
                //     els = document.querySelectorAll('button[data-testid="LocationModalSubmitButton"]');
                //     if (els.length > 0) {
                //         els[0].click();
                //     }
                // });
            }
            if (req.body.with_photo !== undefined) {
                delete filters.with_photo;
                filters.with_photo = req.body.with_photo == "0" ? "0" : "1";

                await myBrowser.page.evaluate(`if(document.querySelector("#MEDIA-image" ).checked != ` + (filters.with_photo == "1") + `){
        document.querySelector("#MEDIA-image").parentElement.click();
    }`);
                await myBrowser.page.waitForTimeout(small_wait);
            }
            await myBrowser.page.waitForTimeout(1000);
            filters.results_button = await myBrowser.page.evaluate(`var el = document.querySelector('[data-testid="AllFiltersResultButton"]');if(el != undefined){el.innerText}else{"Apply"}`);

            console.log(filters);

        }
        //save current filters
        if (req.body.saveFilters != undefined) {
            await save_option_to_db(filter_db_key, filters);
        }

        //load filters history fom database
        filters.filters_history = await get_All_filters_history_names();

    } catch (error) {
        console.error('An error occurred:', error);
    }
    //refresh sent messages data
    filters.msg_ids = await get_messages_ids_from_db();

    //load defualt message
    def_msg = await get_options_by_name(def_msg_key);
}

async function clearValue(page, inputSelector) {
    await page.focus(inputSelector);
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
}
async function isExist(page, selector) {
    return await page.evaluate(`document.querySelector('` + selector + `') != undefined`);
}
async function get_results(page) {
    // await page.evaluate(`document.querySelector('[data-testid="sortOrder"]').click();
    // document.querySelector('[data-testid="sortOrderMenu"] [data-value="YEAR:DESC"]').click();`);
    // await page.waitForTimeout(1000);
    
    // page.evaluate("document.scrollingElement.scrollTop=10;var iv1 = setInterval(function(){document.scrollingElement.scrollTop += 300; },10);var iv2 = setInterval(function(){var moreBtn = document.getElementsByClassName('infinite-scroller__show-more-button')[0];moreBtn.click();},1500);");

    // await page.waitForTimeout(12000);
    // await page.evaluate("clearInterval(iv1);clearInterval(iv2);");

    const sortOrderElement = await page.$('[data-testid="sortOrder"]');
    if (sortOrderElement) {
        await sortOrderElement.click();
        await page.waitForSelector('[data-testid="sortOrderMenu"] [data-value="YEAR:DESC"]');
        await page.click('[data-testid="sortOrderMenu"] [data-value="YEAR:DESC"]');
        await page.waitForTimeout(1000);

        page.evaluate("document.scrollingElement.scrollTop=10;var iv1 = setInterval(function(){document.scrollingElement.scrollTop += 300; },10);var iv2 = setInterval(function(){var moreBtn = document.getElementsByClassName('infinite-scroller__show-more-button')[0];moreBtn.click();},1500);");

        await page.waitForTimeout(12000);
        await page.evaluate("clearInterval(iv1);clearInterval(iv2);");
    }

    await page.waitForSelector("[data-testid='ListItemPage-0']");
    //collect data
    let rslt = await page.evaluate(() => {
        function convertDateFormat(dateString) {
            const parts = dateString.split("/");
            if (parts.length !== 3) {
                throw new Error("Invalid date string format.");
            }

            const day = parts[0];
            const month = parts[1];
            const year = parts[2];

            // Pad day and month with leading zeros if necessary
            const formattedDay = day.padStart(2, "0");
            const formattedMonth = month.padStart(2, "0");

            // Reformat the date string
            const formattedDate = `${year}-${formattedMonth}-${formattedDay}`;
            return formattedDate;
        }
        function getCurrentDateFormatted() {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');

            return `${year}-${month}-${day}`;
        }

        var data = [];
        var elms = document.querySelectorAll("[data-testid='SearchResultList']  article[data-testid='SearchResultListItem']");
        for (let i = 0; i < elms.length; i++) {
            try {
                let ad_id = ""
                try {
                    ad_id = elms[i].querySelector("[data-test-ad-id]").getAttribute("data-test-ad-id").trim();
                } catch { }

                let title = ""
                try {
                    title = elms[i].querySelector("h2").innerText.trim();
                } catch { }

                let ad_link = "";
                try {
                    ad_link = elms[i].querySelector("a").getAttribute('href').trim();
                } catch { }

                let price = "";
                try {
                    price = elms[i].querySelector("[data-testid='searchResultItemPrice']").innerText.trim();
                } catch { }

                let loc = "";
                try {
                    loc = elms[i].querySelector("[aria-label='Location']").parentElement.querySelector("[data-testid='VehicleListItemAttributeValue']").innerText.trim();
                } catch { }

                let date_posted = "";
                try {
                    date_posted = elms[i].querySelector("div .date-posted").innerText.trim();
                    if (date_posted.indexOf('/') != -1) {
                        date_posted = convertDateFormat(date_posted);
                    } else {
                        date_posted = getCurrentDateFormatted();
                    }
                } catch { }

                let description_html = "";
                try {
                    description_html = elms[i].querySelector("[aria-label='Location']").parentElement.parentElement.innerHTML;
                } catch { }

                let dealer_updates = "";
                try {
                    dealer_updates = elms[i].querySelector("div.covid-response").innerText.trim();
                } catch { }

                let imageSrc = "";
                try {
                    imageSrc = elms[i].querySelector("[data-testid='VehicleListItem-figure'] img").getAttribute('src').trim();
                } catch { }


                data.push({ "ad_id": ad_id, "title": title, "ad_link": ad_link, "price": price, "location": loc, "date_posted": date_posted, "description_html": description_html, "dealer_updates": dealer_updates, 'imageSrc': imageSrc });
            } catch (err) {
                continue;
            }
        }

        return data;

    });


    console.log("Done scrapping (" + rslt.length + ") elements.");
    return rslt;
}
app.get('/conv', (req, res, next) => {
    const token = req.cookies.token;
    // Verify and decode the token as needed
    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
            // Token is invalid or expired, handle accordingly
            res.redirect('/login');
        } else {
            // Token is valid, you can access decoded data
            const userId = decoded.id;
            // Your protected route logic here
            next();

        }
    });

}, async (req, res) => {
    var conv_data = await get_messages_from_db();
    res.render('conversations', { conv_data: conv_data });
});

let conv_data = [];
// inbox page to handle conversations sent/received
app.get('/inbox', (req, res, next) => {
    const token = req.cookies.token;
    // Verify and decode the token as needed
    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
            // Token is invalid or expired, handle accordingly
            res.redirect('/login');
        } else {
            // Token is valid, you can access decoded data
            const userId = decoded.id;
            // Your protected route logic here
            next();

        }
    });

}, async (req, res) => {

    while (myBrowser.page == undefined || myBrowser.page === false) {
        await sleep(1000);
    }
    const page = myBrowser.page;

    const url = await page.url();

    if (url.indexOf('kijijiautos.ca/inbox') == -1) {
        await page.goto("https://www.kijijiautos.ca/inbox");
        await page.waitForTimeout(1000);
        await page.waitForSelector('#skip-to-content');
    }

    const is_login_needed = await page.evaluate(() => {
        return document.querySelectorAll('[data-testid="NotLoggedInLoginButton"]').length > 0;
    }, { delay: 1000 });

    if (is_login_needed) {
        return res.redirect('/');
    }

    try {
        def_msg = await get_options_by_name(def_msg_key);

        await myBrowser.page.waitForSelector("[data-testid='InboxContent'],[data-testid='EmptyInboxButton']");

        /*const isEmpty = await page.evaluate(() => {
            return document.querySelectorAll('[data-testid="EmptyInboxButton"]').length>0;
        });*/


    } catch (e) {
        console.error(e);
    }
    var messages_arr = [];
    if (req.query.lastMessage) {

        const isFound = await page.evaluate(() => {
            var els = document.querySelectorAll('[data-testid="ChatResumeCard"]');
            for (let i = 0; i < els.length; i++) {
                if (els[i].innerText.indexOf('2021') != -1) {
                    els[i].click();
                    return true;
                }
            }
            return false;
        });

        if (isFound) {
            await page.waitForTimeout(1000);
            messages_arr = myBrowser.getMessagesArray();

        }
    }
    var conv_arr = myBrowser.getCovArray();
    if (conv_arr.length == 0) {//////////////////////////////// first try /////////////////////////////
        if (url.indexOf('kijijiautos.ca/inbox') == -1) {
            await myBrowser.page.goto("https://www.kijijiautos.ca/inbox", { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(1000);
        }
    }
    conv_arr = myBrowser.getCovArray();
    if (conv_arr.length == 0) {//////////////////////////////// second try /////////////////////////////
        if (url.indexOf('kijijiautos.ca/inbox') == -1) {
            await myBrowser.page.goto("https://www.kijijiautos.ca/inbox", { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(1000);
        }
    }
    conv_arr = myBrowser.getCovArray();
    if (conv_arr.length == 0) {//////////////////////////////// third try /////////////////////////////
        if (url.indexOf('kijijiautos.ca/inbox') == -1) {
            await myBrowser.page.goto("https://www.kijijiautos.ca/inbox", { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(1000);
        }
    }

    var isChatReprested = await myBrowser.page.evaluate(() => {
        var el = document.querySelectorAll('[data-testid="InboxContent"]');
        return el.length > 0;
    });
    // await myBrowser.page.screenshot({path: 'screenshot_inbox.png'});
    if (isChatReprested) {
        conv_arr = myBrowser.getCovArray();
    }
    if (conv_arr && conv_arr.length > 0) {
        for (let i = 0; i < conv_arr.length; i++) {
            const data = JSON.parse(conv_arr[i]);
            if (data != undefined) {
                //sort by  creation date
                data.conversations.sort((a, b) => {
                    return new Date(b.creationDate) - new Date(a.creationDate);
                });
                conv_data.push(data);
            }
        }
    } else {
        conv_data = [];
    }
    console.log(conv_data);
    console.log(messages_arr);

    return res.render('inbox', { conv_data: conv_data, messages_arr: messages_arr, filters: filters, def_msg: def_msg });
});
let saved_messages_logger = [];
app.post('/inbox', (req, res, next) => {
    const token = req.cookies.token;
    // Verify and decode the token as needed
    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
            // Token is invalid or expired, handle accordingly
            res.redirect('/login');
        } else {
            // Token is valid, you can access decoded data
            const userId = decoded.id;
            // Your protected route logic here
            next();

        }
    });

}, async (req, res) => {
    while (myBrowser.page == undefined || myBrowser.page === false) {
        await sleep(1000);
    }
    const page = myBrowser.page;

    const url = await page.url();
    console.log(url);
    if (req.body.action == undefined || req.body.action != "updateMessages") {
        if (req.body.sender_name && conv_data.length > 0 && myBrowser.page != undefined && myBrowser.page !== false && url.indexOf('kijijiautos.ca/inbox') != -1) {
            //select chat message by sender name

            let sender_name = req.body.sender_name;
            let sender_title = req.body.sender_title;

            //click on chat by sender name
            await myBrowser.page.evaluate((sender_name, sender_title) => {
                var els = document.querySelectorAll('[data-testid="ChatResumeCard"]');
                for (let i = 0; i < els.length; i++) {
                    if (sender_title) {
                        if (els[i].innerText.indexOf(sender_name) != -1 && els[i].innerText.indexOf(sender_title) != -1) {
                            els[i].click();
                        }
                    } else {
                        if (els[i].innerText.indexOf(sender_name) != -1) {
                            els[i].click();
                        }
                    }
                }
            }, sender_name, sender_title);
        }
        if (req.body.sender_name && req.body.conv_txt) {
            //send a message to the dealer on current browser chat
            await myBrowser.page.type('[data-testid="MessageInputTextArea"]', req.body.conv_txt, { delay: 1, clear: true });
            await myBrowser.page.evaluate(`document.querySelector('[data-testid="SendMessageButton"]').click();`);

        }
    }
    //look for conversation data
    let c_data = [];
    if (req.body.conv_id && conv_data.length > 0 && conv_data[conv_data.length - 1].conversations.length > 0) {
        var conv_idx = conv_data.length - 1;
        for (let i = 0; i < conv_data[conv_idx].conversations.length; i++) {
            let data = conv_data[conv_idx].conversations[i];
            if (data.adId == req.body.conv_id) {
                c_data = data;
                break;
            }
        }
    }
    //get all current chat messages from browser chat page
    let current_chat_messages = await myBrowser.page.evaluate(() => {
        var els = document.querySelectorAll('[data-testid="ChatMessageItem"]');
        var rslt_arr = [];
        for (var i = 0; i < els.length; i++) {

            if (els[i].querySelectorAll('span').length > 1) {
                var spans = els[i].querySelectorAll('span');
                var classes = els[i].firstChild.firstChild.getAttribute('class');
                rslt_arr.push({ txt: spans[0].innerText, time: spans[1].innerText, classes: classes });
            }
        }
        return rslt_arr;
    });

    let sender = "me";
    //check if we saved all messages to database
    if (current_chat_messages.length >= 0) {
        for (var i = 0; i < current_chat_messages.length; i++) {
            const msg_md5 = MD5(current_chat_messages[i].txt + "\r\n" + current_chat_messages[i].time);
            if (saved_messages_logger.indexOf(msg_md5) == -1) {
                if (current_chat_messages[i].classes.length > 0 && current_chat_messages[i].classes.indexOf('h3--no') == -1) {
                    sender = "him";
                }
                await insert_chat_to_db(req.body.conv_id, sender, req.body.sender_name, current_chat_messages[i].txt, c_data);

                saved_messages_logger.push(msg_md5);
            }
        }
    }

    res.status(200).send(current_chat_messages);
});
//get database messages for specified ad_id
app.post('/db_msgs', async (req, res) => {
    const ad_id = req.body.ad_id;
    if (ad_id != undefined) {
        res.json({ 'msgs': await get_messages_from_db(ad_id) });
        return;
    }
    res.json({ 'error': 'No ad_id is set.' });
});

//send multiple messages (conversations) at once (instantly) using kijiji current browser page
let is_sending_started = false;
let sending_progress = 0;

let sending_successCount = 0;
let sending_failCount = 0;
app.post('/sendMsgs', async (req, res) => {

    if (!is_sending_started && req.body.urls && req.body.urls.length > 0) {
        is_sending_started = true;

        res.json({ 'sending': is_sending_started, 'sending_progress': sending_progress });

        const urls = req.body.urls;
        for (let i = 0; i < urls.length; i++) {
            await myBrowser.page.goto(urls[i], { waitUntil: "networkidle2", timeout: 0 });

            await myBrowser.page.evaluate(`var el = document.querySelectorAll('[data-testid="MessageButton"]');if(el.length>0){el[0].click()}`);

            if (def_msg == '') {
                def_msg = await get_options_by_name(def_msg_key);
            }
            const fullName = 'Michael';
            let emailAddress = 'Dan.cole@ccloudtech.com';

            //get data from database
            const data = await get_options_by_name(login_db_key);
            if (data && data.uname) {
                emailAddress = data.uname;
            }
            //clear old text
            // await myBrowser.page.evaluate(`var el = document.querySelector('#messageInquery');if(el != undefined){el.innerText="";el.value='';}`);
            await clearValue(myBrowser.page, '#messageInquery');
            await myBrowser.page.type('#messageInquery', def_msg, { delay: 1, clear: true });


            // await myBrowser.page.evaluate(`document.querySelector('#nameInquery').value = '';`);
            if (await isExist(myBrowser.page, '#nameInquery')) {
                await clearValue(myBrowser.page, '#nameInquery');
                await myBrowser.page.type('#nameInquery', fullName, { delay: 5, clear: true });
            }
            // await myBrowser.page.evaluate(`document.querySelector('#emailInquery').value = '';`);
            if (await isExist(myBrowser.page, '#emailInquery')) {
                await clearValue(myBrowser.page, '#emailInquery');
                await myBrowser.page.type('#emailInquery', emailAddress, { delay: 5, clear: true });
            }


            //click send message button or get validation error if any
            let rslt = await myBrowser.page.evaluate(() => {
                var retryBtn = document.querySelector('[data-testid="SendAgainButton"]');
                if (retryBtn !== undefined && retryBtn != null) {
                    retryBtn.click();
                }
                var btn = document.querySelector('[data-testid="OpenContactFormSendButton"]');
                if (btn == undefined || btn == null) {
                    btn = document.querySelector('[data-testid="SendContactFormInfoButton"]');
                }
                if (btn.disabled) {
                    //phoneInquery-errorMessage
                    //emailInquery-errorMessage
                    var err1 = document.querySelector('#emailInquery-errorMessage');
                    var err2 = document.querySelector('#phoneInquery-errorMessage');

                    var msg = '';
                    if (err1 != undefined) {
                        msg += err1.innerText;
                    }
                    if (err2 != undefined) {
                        msg += ', ' + err2.innerText;
                    }
                    return msg == '' ? 'Error: Please make sure all input fields are correct.' : msg;
                }
                btn.click();
                return '';
            });

            try {
                await myBrowser.page.waitForTimeout(500);
                await myBrowser.page.waitForSelector('[data-testid="ContactFormModalMessageSent"]');
            } catch (err) {
                console.error("error when waiting after conversation", err);
            }

            const send_feedback = await myBrowser.page.evaluate(() => {
                //data-testid="ContactFormModalMessageSent"
                var el = document.querySelector('[data-testid="ContactFormModalMessageSent"]');
                if (el == undefined) {
                    el = document.querySelector('[data-testid="OpenContactForm"]');
                }
                if (el != undefined) {
                    return el.innerText;
                } else {
                    return 'Something went wrong'
                }
            });


            if (send_feedback != undefined && send_feedback.indexOf("Message was sent") != -1) {

                //get ad id
                const url = urls[i];
                const idx = url.indexOf('/vip/') + 5;
                const ad_id = url.substr(idx);


                await save_message_to_db(ad_id, def_msg, url);

                sending_successCount++;
            } else {
                sending_failCount++;
            }
            sending_progress = Math.round(i * 100 / urls.length);
        }
        is_sending_started = false;
    } else {
        res.json({ 'sending': is_sending_started, 'sending_progress': sending_progress });
    }
});

let queueBrowser = null;
//send a message to a single queue by its DB (id and url)
async function proces_queue_message(queue_id, url) {
    try {

        let emailAddress = '';
        if (queueBrowser == null) {
            queueBrowser = new Browser(main_page_url);
        }
        while (queueBrowser.page == undefined || queueBrowser.page === false) {
            await sleep(1000);
        }
        const page = queueBrowser.page;

        // check if we are logged in
        const isloggedin = await page.evaluate(() => {
            var els = document.querySelectorAll('[data-testid="navigation-menu-login"]');
            if (els.length > 0) {
                return els[0].innerText != 'Sign in';
            }
            var els2 = document.querySelectorAll('[data-testid="buttons-logged-in-navigation-button"]');
            return els2.length > 0;
        });

        if (!isloggedin) {
            try {
                //get data from database
                const data = await get_options_by_name(login_db_key);
                if (data && data.uname) {
                    const upass = data.upass;
                    const uname = data.uname;
                    emailAddress = data.uname;
                    //--------------- trying to login
                    //click on login menu item
                    // await page.evaluate(() => {
                    //     var els = document.querySelectorAll('[data-testid="navigation-menu-login"]');
                    //     if (els.length > 0) {
                    //         els[0].click();
                    //     }
                    // });
                    await page.click('[data-testid="navigation-menu-login"]');
                    await page.waitForNavigation();

                    await page.waitForSelector('#username', { timeout: 60000 });

                    await page.evaluate(`document.querySelector('#username').value = "` + uname + `";
                document.querySelector('#password').value = "`+ upass + `";
                document.querySelector('#login-submit').click();`);

                    await page.waitForNavigation();
                    await page.waitForTimeout(2000);

                    const loginErrorMsg = await page.evaluate(() => {
                        var els = document.querySelectorAll('.form-element.errors');
                        if (els.length == 0) {
                            els = document.querySelectorAll('.error-message');
                        }
                        if (els.length > 0) {
                            return els[0].innerText;
                        }
                        return '';
                    });

                    if (loginErrorMsg != '') {//login error
                        console.log(loginErrorMsg);
                        return false;
                    } else {
                        await page.waitForSelector('[data-testid="buttons-logged-in-navigation-button"]');
                    }
                }
            } catch (err) {
                console.log(err);
            }
        }

        //start sending message
        try {
            await page.goto(url, { waitUntil: "networkidle2", timeout: 0 });
        } catch (err) {
            await page.goto(url, { waitUntil: "networkidle2", timeout: 0 });
            console.log(err);
        }
        await page.evaluate(`var el = document.querySelectorAll('[data-testid="MessageButton"]');if(el.length>0){el[0].click()}`);

        if (def_msg == '') {
            def_msg = await get_options_by_name(def_msg_key);
        }
        const fullName = 'Michael';

        //get data from database
        if (emailAddress == '') {
            const data = await get_options_by_name(login_db_key);
            if (data && data.uname) {
                emailAddress = data.uname;
            } else {
                console.log('No email address found');
                return false;
            }
        }
        await page.waitForSelector('#messageInquery');

        //clear old text
        // await page.evaluate(`var el = document.querySelector('#messageInquery');if(el != undefined){el.innerText="";el.value='';}`);
        await clearValue(page, '#messageInquery');
        await page.type('#messageInquery', def_msg, { delay: 1, clear: true });


        // await page.evaluate(`document.querySelector('#nameInquery').value = '';`);
        if (await isExist(page, '#nameInquery')) {
            await clearValue(page, '#nameInquery');
            await page.type('#nameInquery', fullName, { delay: 5, clear: true });
        }
        // await page.evaluate(`document.querySelector('#emailInquery').value = '';`);
        if (await isExist(page, '#emailInquery')) {
            await clearValue(page, '#emailInquery');
            await page.type('#emailInquery', emailAddress, { delay: 5, clear: true });
        }


        //click send message button or get validation error if any
        let rslt = await page.evaluate(() => {
            var retryBtn = document.querySelector('[data-testid="SendAgainButton"]');
            if (retryBtn !== undefined && retryBtn != null) {
                retryBtn.click();
            }
            var btn = document.querySelector('[data-testid="OpenContactFormSendButton"]');
            if (btn == undefined || btn == null) {
                btn = document.querySelector('[data-testid="SendContactFormInfoButton"]');
            }
            if (btn.disabled) {
                //phoneInquery-errorMessage
                //emailInquery-errorMessage
                var err1 = document.querySelector('#emailInquery-errorMessage');
                var err2 = document.querySelector('#phoneInquery-errorMessage');

                var msg = '';
                if (err1 != undefined) {
                    msg += err1.innerText;
                }
                if (err2 != undefined) {
                    msg += ', ' + err2.innerText;
                }
                return msg == '' ? 'Error: Please make sure all input fields are correct.' : msg;
            }
            btn.click();
            return '';
        });

        try {
            await page.waitForTimeout(500);
            await page.waitForSelector('[data-testid="ContactFormModalMessageSent"]');
            await page.waitForTimeout(1000);

        } catch (err) {
            console.error("error when waiting after conversation", err);
        }

        let send_feedback = await page.evaluate(() => {
            //data-testid="ContactFormModalMessageSent"
            var el = document.querySelector('[data-testid="ContactFormModalMessageSent"]');
            if (el == undefined) {
                el = document.querySelector('[data-testid="OpenContactForm"]');
            }
            if (el != undefined) {
                return el.innerText;
            } else {
                return 'Something went wrong'
            }
        });

        //wait more time for feedback if message was not sent
        if(send_feedback == undefined || send_feedback.indexOf("Message was sent") == -1) {
            try {
                await page.waitForTimeout(500);
                await page.waitForSelector('[data-testid="ContactFormModalMessageSent"]');
                await page.waitForTimeout(1000);
    
            } catch (err) {
                console.error("error when waiting after conversation", err);
            }
            //refresh feed back once again
            send_feedback = await page.evaluate(() => {
                //data-testid="ContactFormModalMessageSent"
                var el = document.querySelector('[data-testid="ContactFormModalMessageSent"]');
                if (el == undefined) {
                    el = document.querySelector('[data-testid="OpenContactForm"]');
                }
                if (el != undefined) {
                    return el.innerText;
                } else {
                    return 'Something went wrong'
                }
            });
        }
        //check feed back 
        if (send_feedback != undefined && send_feedback.indexOf("Message was sent") != -1) {

            //get ad id
            const idx = url.indexOf('/vip/') + 5;
            const ad_id = url.substr(idx);


            await save_message_to_db(ad_id, def_msg, url);
            await update_single_queue_status_db(queue_id, 1);
            return true;
        } else {
            
            console.log('message was not sent', send_feedback);
            return false;
        }
    } catch (err1) {
        console.log(err1);
        return false;

    }
}

//add messages to the queue and start sending
let is_queue_started = false;
let queue_wait_time = 60 * 1000;//1 minute
const queue_wait_time_key = 'queue_wait_time';//in minutes
let interValId;
let is_processing_single_queue = false;
//get next queue data from database and call proces_queue_message to hanlde it or stop processing once queue is empty
async function process_queue() {
    const data = await get_next_queue_from_db();
    if (data === '') {
        clearInterval(interValId);
        is_queue_started = false;
        console.log('Queue processing is finished');
    } else {
        const url = data.url;
        const id = data.id;
        if (!is_processing_single_queue) {
            is_processing_single_queue = true;
            console.log("Start single queue processing.");
            await proces_queue_message(id, url);
            console.log("Done single queue processing.");
            is_processing_single_queue = false;
        }
    }
}
//start whole queue processing
async function start_queue_processing() {
    //get wait time from database if exists
    let db_wait_time = await get_options_by_name(queue_wait_time_key);
    if (db_wait_time != null) {
        queue_wait_time = db_wait_time * 60 * 1000;
    }
    if (!is_queue_started) {
        is_queue_started = true;
        if (queueBrowser == null) {
            queueBrowser = new Browser(main_page_url);
        }
        
        let canSendMessage = false;
        const qry1 = `SELECT conv_data, creation_date FROM conversations ORDER BY creation_date DESC LIMIT 1`;
        const result = await queryAsync(qry1);

        if (result.length > 0) {
            const lastInsertedRecord = result[0];
            const createdTimestamp = new Date(lastInsertedRecord.creation_date).getTime(); // Convert 'creation_date' to timestamp
            const currentTimestamp = Date.now(); // Get the current timestamp

            if (currentTimestamp - createdTimestamp > queue_wait_time) {
                canSendMessage = true;
                console.log("The record is older than the specified delay time.");
            } else {
                canSendMessage = false;
                console.log("The record is not older than the specified delay time.");
            }
        } else {
            canSendMessage = false;
            console.log("No records found in the 'conversations' table.");
        }

        if (canSendMessage) {
            await process_queue();
        }
        interValId = setInterval(async function () { await process_queue() }, queue_wait_time);
    }
}
//call queue processing to start as soon as the app start
console.log("Starting messages queue");
start_queue_processing();

async function restart_queue_processing() {
    if (is_queue_started) {
        while (is_processing_single_queue) {
            await sleep(500);
        }
        clearInterval(interValId);
        is_queue_started = false;
    }
    await start_queue_processing();
}
app.post('/queueMessages', async (req, res) => {
    if (req.body.action && req.body.action == "add" && req.body.urls && req.body.urls.length > 0) {
        res.json({ 'status': 'success', 'message': 'urls is added to the queue.' });
        await add_queue_to_db(req.body.urls);

    } else if (req.body.action && req.body.action == "update" && req.body.wait_minutes) {
        await save_option_to_db(queue_wait_time_key, req.body.wait_minutes);

        res.json({ 'status': 'success', 'message': 'Queue wait minutes is updated.' });
        //restart the queue after we updated wait time
        await restart_queue_processing();
    } else {
        res.json({ 'status': 'success', 'message': 'Queue processing is started.' });
    }

    await start_queue_processing();
});

let settings = {};
app.get('/settings', (req, res, next) => {
    const token = req.cookies.token;
    // Verify and decode the token as needed
    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
            // Token is invalid or expired, handle accordingly
            res.redirect('/login');
        } else {
            // Token is valid, you can access decoded data
            const userId = decoded.id;
            // Your protected route logic here
            next();

        }
    });

}, async (req, res) => {

    await settingsCallback(req, res);
    return res.render('settings', { settings: settings, filters: filters });
});
app.post('/settings', (req, res, next) => {
    const token = req.cookies.token;
    // Verify and decode the token as needed
    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
            // Token is invalid or expired, handle accordingly
            res.redirect('/login');
        } else {
            // Token is valid, you can access decoded data
            const userId = decoded.id;
            // Your protected route logic here
            next();

        }
    });

}, async (req, res) => {

    await settingsCallback(req, res);
    return res.render('settings', { settings: settings, filters: filters });
});

app.get('/queue_status', (req, res, next) => {
    const token = req.cookies.token;
    // Verify and decode the token as needed
    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
            // Token is invalid or expired, handle accordingly
            res.redirect('/login');
        } else {
            // Token is valid, you can access decoded data
            const userId = decoded.id;
            // Your protected route logic here
            next();

        }
    });

}, async (req, res) => {

    const rslt = await get_queue_messages_count();
    const db_wait_time = await get_options_by_name(queue_wait_time_key);
    res.render('queue_status', { counts: rslt, current_wait_time: db_wait_time, filters: filters });
    await start_queue_processing();

});
//settings db keys
const def_msg_key = 'default_message';
let def_msg = '';
async function settingsCallback(req, res) {

    //save settings to db
    if (req.body.defaultMsg) {
        await save_option_to_db(def_msg_key, req.body.defaultMsg);
    }

    def_msg = await get_options_by_name(def_msg_key);
    if (!def_msg) {
        def_msg = `Hello, my name is Michael. The truck looks good in the pictures. Any real damage worth mentioning? Do you know if it’s ever been in a major accident?

Can you send me the vin and I will get a carfax report for it. 
        
Thank you 
Michael.`;
    }
    settings.defaultMsg = def_msg;
}
// Set up a route to handle a GET request
app.get('/search', (req, res, next) => {
    const token = req.cookies.token;
    // Verify and decode the token as needed
    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
            // Token is invalid or expired, handle accordingly
            res.redirect('/login');
        } else {
            // Token is valid, you can access decoded data
            const userId = decoded.id;
            // Your protected route logic here
            next();

        }
    });

}, (req, res) => {
    // const search_key = req.query.search_key;

    // if (search_key == null) {
    //     res.status(404);
    //     res.json({ 'error': 'search_key is not set.' });
    // } else {
    // run_scraping(search_key).then(function (data) {

    //     save_to_db(data).then(function (data2) {
    //         console.log("Done saving to db:");
    //         console.log(data2);
    //     });

    //     res.json(data);

    // }).catch(function (err) {
    //     console.log("-------------ERROR------------\r\n");
    //     console.log(err);
    //     res.json(err);

    // });

    myBrowser.getFilters();
    // Output: Opening https://www.example.com in MyBrowser 1.0.0...

    // Do some other operationss...
    // }
});

app.listen(port, () => {
    console.log(`Server is running on http://${hostname}:${port}`);
});

// //------------- scrapping work
// const defaultUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36 Edg/109.0.1518.61";
// const isHeadless = false;//'new';


// async function createPage(browser, url) {

//     const page = (await browser.pages())[0];
//     await page.setCacheEnabled(false);

//     //Randomize viewport size
//     await page.setViewport({
//         width: 880 + Math.floor(Math.random() * 500),
//         height: 600 + Math.floor(Math.random() * 100),
//         deviceScaleFactor: 1,
//         hasTouch: false,
//         isLandscape: false,
//         isMobile: false,
//     });
//     await page.setUserAgent(defaultUA);
//     await page.setJavaScriptEnabled(true);
//     await page.setDefaultNavigationTimeout(0);

//     //Skip images/styles/fonts loading for performance
//     /*await page.setRequestInterception(true);
//       page.on("request", (req) => {
//         if (
//           req.resourceType() == "stylesheet" ||
//           req.resourceType() == "font" ||
//           req.resourceType() == "image"
//         ) {
//           req.abort();
//         } else {
//           req.continue();
//         }
//       });
//       /**/
//     await page.evaluateOnNewDocument(() => {
//         // Pass webdriver check
//         Object.defineProperty(navigator, "webdriver", {
//             get: () => false,
//         });
//     });

//     await page.evaluateOnNewDocument(() => {
//         // Pass chrome check
//         window.chrome = {
//             runtime: {},
//             // etc.
//         };
//     });

//     await page.evaluateOnNewDocument(() => {
//         //Pass notifications check
//         const originalQuery = window.navigator.permissions.query;
//         return (window.navigator.permissions.query = (parameters) =>
//             parameters.name === "notifications"
//                 ? Promise.resolve({ state: Notification.permission })
//                 : originalQuery(parameters));
//     });

//     await page.evaluateOnNewDocument(() => {
//         // Overwrite the `plugins` property to use a custom getter.
//         Object.defineProperty(navigator, "plugins", {
//             // This just needs to have `length > 0` for the current test,
//             // but we could mock the plugins too if necessary.
//             get: () => [1, 2, 3, 4, 5],
//         });
//     });
//     await page.setExtraHTTPHeaders({
//         'Accept-Language': 'en'
//     });
//     await page.evaluateOnNewDocument(() => {
//         // Overwrite the `languages` property to use a custom getter.
//         Object.defineProperty(navigator, "languages", {
//             get: () => ["en-US", "en"],
//         });
//     });
//     page.on("error", async () => {
//         console.log("Lost Internet Connection");
//     });
//     try {
//         //page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
//         await page.goto(url, { waitUntil: "networkidle2", timeout: 0 });
//         const date = new Date();
//         const hour = date.getHours();
//         const minute = date.getMinutes();
//         const second = date.getSeconds();
//         console.log(`Page Opened at \t\t ${hour}:${minute}:${second}`);
//     } catch (e) {
//         console.log(e);
//         return false;
//     }
//     return page;
// }

// async function doScript(page, script) {
//     try {
//         await page.evaluate(script, { delay: 500 });
//     } catch (e) {
//         console.log(e);
//     }
// }
// function getBrowserArgs() {
//     return [
//         "--lang=en",
//         "--no-sandbox",
//     ];
// }

// async function run_scraping(search_key = "ford-f150") {
//     const isIgnoreHTTPSErrors = false;
//     search_key = search_key.replaceAll(' ', '-');

//     const firstURL = "https://www.kijiji.ca/b-cars-trucks/canada/" + search_key + "/k0c174l0?gpTopAds=y";

//     pageOptions = {
//         waitUntil: "networkidle2",
//         timeout: 90000,
//     };
//     puppeteerExtra.use(pluginStealth());
//     //console.log(executablePath());
//     browser = await puppeteerExtra.launch({
//         headless: isHeadless,
//         handleSIGINT: false,
//         ignoreHTTPSErrors: isIgnoreHTTPSErrors,
//         args: getBrowserArgs(),
//         env: { LANGUAGE: "en" },
//         executablePath: executablePath(),
//     });
//     let page = await createPage(browser, firstURL);
//     while (page === false) {
//         console.log("Connection Failed, Restarting Browser.");

//         await browser.close();
//         puppeteerExtra.use(pluginStealth());

//         browser = await puppeteerExtra.launch({
//             headless: isHeadless,
//             handleSIGINT: false,
//             ignoreHTTPSErrors: isIgnoreHTTPSErrors,
//             args: getBrowserArgs(),
//             env: { LANGUAGE: "en" },
//             executablePath: executablePath(),
//         });
//         page = await createPage(browser, firstURL);
//     }

//     //wait page to load
//     await page.waitForSelector(".search-item .info");

//     // //start scrolling
//     await doScript(
//         page,
//         "document.scrollingElement.scrollTop=10;var iv1 = setInterval(function(){document.scrollingElement.scrollTop += 200; },20);var iv2 = setInterval(function(){var moreBtn = document.getElementsByClassName('infinite-scroller__show-more-button')[0];moreBtn.click();},1500);"
//     );

//     // try {
//     //     //wait for scrolling to finish
//     //     await page.waitForFunction(
//     //         () => {
//     //             let el = document.querySelector("#BaseMiniLeaderboard");
//     //             return el == null;
//     //         },
//     //         { timeout: 1000 * 50 }//50 seconds
//     //     );
//     // } catch (err) {
//     //     console.log(err);
//     // }
//     await page.waitForTimeout(4000);
//     await page.waitForSelector("#mainPageContent > div.layout-3 > div.col-2 > main > div:nth-child(2) > div[data-listing-id]");
//     //collect data
//     let rslt = await page.evaluate(() => {
//         function convertDateFormat(dateString) {
//             const parts = dateString.split("/");
//             if (parts.length !== 3) {
//                 throw new Error("Invalid date string format.");
//             }

//             const day = parts[0];
//             const month = parts[1];
//             const year = parts[2];

//             // Pad day and month with leading zeros if necessary
//             const formattedDay = day.padStart(2, "0");
//             const formattedMonth = month.padStart(2, "0");

//             // Reformat the date string
//             const formattedDate = `${year}-${formattedMonth}-${formattedDay}`;
//             return formattedDate;
//         }
//         function getCurrentDateFormatted() {
//             const today = new Date();
//             const year = today.getFullYear();
//             const month = String(today.getMonth() + 1).padStart(2, '0');
//             const day = String(today.getDate()).padStart(2, '0');

//             return `${year}-${month}-${day}`;
//         }

//         var data = [];
//         var elms = document.querySelectorAll("#mainPageContent > div.layout-3 > div.col-2 > main > div:nth-child(2) > div[data-listing-id]");
//         for (let i = 0; i < elms.length; i++) {
//             try {
//                 let ad_id = ""
//                 try {
//                     ad_id = elms[i].getAttribute("data-listing-id").trim();
//                 } catch { }

//                 let title = ""
//                 try {
//                     title = elms[i].querySelector("a.title").innerText.trim();
//                 } catch { }

//                 let ad_link = "";
//                 try {
//                     ad_link = elms[i].querySelector("a.title").getAttribute('href').trim();
//                 } catch { }

//                 let price = "";
//                 try {
//                     price = elms[i].querySelector("div.price").innerText.trim();
//                 } catch { }

//                 let loc = "";
//                 try {
//                     loc = elms[i].querySelector("div.location").innerText.trim();
//                 } catch { }

//                 let date_posted = "";
//                 try {
//                     date_posted = elms[i].querySelector("div .date-posted").innerText.trim();
//                     if (date_posted.indexOf('/') != -1) {
//                         date_posted = convertDateFormat(date_posted);
//                     } else {
//                         date_posted = getCurrentDateFormatted();
//                     }
//                 } catch { }

//                 let description_html = "";
//                 try {
//                     description_html = elms[i].querySelector("div.description").innerHTML.replaceAll('\n                            ', '').replaceAll('\n                ', '').replaceAll('   ', '');
//                 } catch { }

//                 let dealer_updates = "";
//                 try {
//                     dealer_updates = elms[i].querySelector("div.covid-response").innerText.trim();
//                 } catch { }

//                 let imageSrc = "";
//                 try {
//                     imageSrc = elms[i].querySelector("div .image img").getAttribute('src').trim();
//                 } catch { }


//                 data.push({ "ad_id": ad_id, "title": title, "ad_link": ad_link, "price": price, "location": loc, "date_posted": date_posted, "description_html": description_html, "dealer_updates": dealer_updates, 'imageSrc': imageSrc });
//             } catch (err) {
//                 continue;
//             }
//         }

//         return data;

//     });

//     console.log("Done scrapping (" + rslt.length + ") elements.");


//     await page.close();
//     await browser.close();

//     return rslt;
// }


