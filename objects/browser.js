const { executablePath } = require("puppeteer");
const puppeteerExtra = require("puppeteer-extra");
const pluginStealth = require("puppeteer-extra-plugin-stealth");


const defaultUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36 Edg/109.0.1518.61";
const isHeadless = 'new';
let results_arr = [];
let conv_arr = [];
let messages_arr = [];

class Browser {
    constructor(url) {
        this.url = url;
        const isIgnoreHTTPSErrors = false;

        // const firstURL = "https://www.kijiji.ca/b-cars-trucks/canada/" + search_key + "/k0c174l0?gpTopAds=y";


        puppeteerExtra.use(pluginStealth());
        //console.log(executablePath());
        (async () => {
            this.browser = await puppeteerExtra.launch({
                headless: isHeadless,
                handleSIGINT: true,
                ignoreHTTPSErrors: isIgnoreHTTPSErrors,
                args: getBrowserArgs(),
                env: { LANGUAGE: "en" },
                executablePath: executablePath(),
            });
            this.page = await createPage(this.browser, this.url);
            while (this.page === false) {
                console.log("Connection Failed, Restarting Browser.");

                await this.browser.close();
                puppeteerExtra.use(pluginStealth());

                this.browser = await puppeteerExtra.launch({
                    headless: isHeadless,
                    handleSIGINT: true,
                    ignoreHTTPSErrors: isIgnoreHTTPSErrors,
                    args: getBrowserArgs(),
                    env: { LANGUAGE: "en" },
                    executablePath: executablePath(),
                });
                this.page = await createPage(this.browser, this.url);
            }
        })();


    }
    getResultsArray() {
        return results_arr;
    }
    reseetResultsArray() {
        results_arr = [];
    }
    getCovArray() {
        return conv_arr;
    }
    getMessagesArray() {
        return messages_arr;
    }
    open(url) {
        if (this.page === false) {
            console.error("Error finding browser page.");
        } else {
            console.log(`Opening ${this.url}`);
            // Your code to open the URL in the browser would go here
        }
    }
    close() {
        console.log(`Closing ${this.name} ${this.version}...`);
        // Your code to close the browser would go here
        this.browser.close();
    }
    doScript(script) {
        (async () => {
            try {
                await this.page.evaluate(script, { delay: 500 });
            } catch (e) {
                console.log(e);
            }
        })();
    }
}

async function createPage(browser, url) {

    const page = (await browser.pages())[0];
    await page.setCacheEnabled(false);

    //Randomize viewport size
    await page.setViewport({
        width: 1180 + Math.floor(Math.random() * 500),
        height: 844,//800 + Math.floor(Math.random() * 100),
        deviceScaleFactor: 1,
        hasTouch: false,
        isLandscape: false,
        isMobile: false,
    });
    await page.setUserAgent(defaultUA);
    await page.setJavaScriptEnabled(true);
    await page.setDefaultNavigationTimeout(0);

    //Skip images/styles/fonts loading for performance
    /*await page.setRequestInterception(true);
    page.on("request", (req) => {
        if (
            req.resourceType() == "stylesheet" ||
            req.resourceType() == "font" ||
            req.resourceType() == "image"
        ) {
            req.abort();
        } else {
            if (req.resourceType() == "xhr") {

                // console.log("Request URL:", req.url());
                // console.log("Request Method:", req.method());
                // console.log("Request Headers:", req.headers());
                // console.log("Request Post Data:", req.postData());
            }
            req.continue();
        }
    });
    /**/

    page.on("response", async (res) => {
        if (res.request().resourceType() === "fetch") {
            // console.log("Response Status:", res.status());
            // console.log("Response Headers:", res.headers());

            try {
                const responseBody = await res.text();
                if (responseBody.indexOf(`{"listings":`) != -1) {
                    //results_arr = [];
                    results_arr.push(responseBody);
                } else if (responseBody.indexOf(`"conversations":`) != -1) {
                    conv_arr = [];
                    conv_arr.push(responseBody);
                } else if (responseBody.indexOf(`"messages":`) != -1) {
                    messages_arr = [];
                    messages_arr.push(responseBody);
                }
            } catch (error) {
                //  console.error("Error while reading the response body:", error);
            }
        }
    });
    await page.evaluateOnNewDocument(() => {
        // Pass webdriver check
        Object.defineProperty(navigator, "webdriver", {
            get: () => false,
        });
    });

    await page.evaluateOnNewDocument(() => {
        // Pass chrome check
        window.chrome = {
            runtime: {},
            // etc.
        };
    });

    await page.evaluateOnNewDocument(() => {
        //Pass notifications check
        const originalQuery = window.navigator.permissions.query;
        return (window.navigator.permissions.query = (parameters) =>
            parameters.name === "notifications"
                ? Promise.resolve({ state: Notification.permission })
                : originalQuery(parameters));
    });

    await page.evaluateOnNewDocument(() => {
        // Overwrite the `plugins` property to use a custom getter.
        Object.defineProperty(navigator, "plugins", {
            // This just needs to have `length > 0` for the current test,
            // but we could mock the plugins too if necessary.
            get: () => [1, 2, 3, 4, 5],
        });
    });
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en'
    });
    await page.evaluateOnNewDocument(() => {
        // Overwrite the `languages` property to use a custom getter.
        Object.defineProperty(navigator, "languages", {
            get: () => ["en-US", "en"],
        });
    });
    page.on("error", async () => {
        console.log("Lost Internet Connection");
    });
    try {
        //page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
        await page.goto(url, { waitUntil: "networkidle2", timeout: 0 });
        const date = new Date();
        const hour = date.getHours();
        const minute = date.getMinutes();
        const second = date.getSeconds();
        console.log(`Page Opened at \t\t ${hour}:${minute}:${second}`);
    } catch (e) {
        console.log(e);
        return false;
    }
    return page;
}

async function doScript(page, script) {
    try {
        await page.evaluate(script, { delay: 500 });
    } catch (e) {
        console.log(e);
    }
}
function getBrowserArgs() {
    return [
        "--lang=en",
        "--no-sandbox",
    ];
}

module.exports = Browser;
