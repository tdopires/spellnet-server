const functions = require("firebase-functions");
const request = require("request");
const cheerio = require("cheerio");
const Promise = require("promise");

exports.findCardPrices = functions.https.onCall((data, context) => {
  const cardname = data.cardName.replace("  //  ", " // ");
  functions.logger.log("Looking for " + cardname);

  return new Promise((resolve, reject) => {
    buildFindPromise(cardname).then((card) => {
      resolve(card);
    }, (err) => {
      if (cardname.includes("//")) {
        functions.logger.log("Card looks like MDFC: " + cardname);
        const mdfccardname = cardname.split("//")[0].trim();
        functions.logger.log("Looking for MDFC: " + mdfccardname);
        buildFindPromise(mdfccardname).then((mdfccard) => {
          resolve(mdfccard);
        }, (err2) => {
          reject(err2);
        });
      } else {
        return (err);
      }
    });
  });
});


const requestp = (options, data) => {
  data = data || false;
  return new Promise((resolve, reject) => {
    request(options.url, (err, res, body) => {
      if (err) {
        return reject(err);
      } else if (res.statusCode !== 200) {
        err = new Error("Unexpected status code: " + res.statusCode);
        err.res = res;
        return reject(err);
      } else {
        resolve(body);
      }
    });
  });
};

const buildFindPromise = function(cardname) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      // proxyUrl: proxy,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36" +
                " (KHTML, like Gecko) Chrome/44.0.2403.155 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;" +
                "q=0.9,image/webp,*/*;q=0.8",
      },
      url: "https://ligamagic.com.br/?view=cards/card&card=" + cardname,
    };
    requestp(requestOptions)
        .then((body) => {
          if (body.indexOf("vetPorEdicao") == -1) {
            reject(Error("Card not found"));
          }

          functions.logger.log("Found data for " + cardname + "... Parsing it");

          // read the data
          const $ = cheerio.load(body);

          const title = $(".nome-auxiliar").eq(0).text();
          const cardSetsObj = {};
          const card = {};
          const curency = "BRL";

          const regexSetsPrices = new RegExp("g_avgprice=\\'(.*?)\\'", "i");
          const setsPrices = JSON.parse(body.match(regexSetsPrices)[1]);

          $(".card-image .edicoes li").each((i, elem) => {
            const regexSetInfo = new RegExp(
                "vetPorEdicao\\[" + i.toString() + "\\]=\\[(.*?)\\];", "i");
            const matched = body.match(regexSetInfo)[1];
            const sanitized = matched.replace(String.fromCharCode(92), "");

            const setInfo = JSON.parse("[" + sanitized + "]");

            const cardSet = setInfo[5];
            const cardPrices = setsPrices[setInfo[7]];

            cardSetsObj[cardSet] = {}; // No prices found yet!

            // Minor, medium and major price for the card, and also set info
            cardSetsObj[cardSet][curency] = [
              cardPrices["precoMenor"].toFixed(2).toString(),
              cardPrices["precoMedio"].toFixed(2).toString(),
              cardPrices["precoMaior"].toFixed(2).toString(),
            ]; // Set prices as USD
          });

          card["title"] = title;
          card["prices"] = cardSetsObj;
          card["sets"] = Object.keys(cardSetsObj);
          card["currencies"] = [curency];
          card["url"] = requestOptions["url"];

          resolve(card);
          // resolve("Misterious card info!");
        }, (err) => {
          reject(err); // Cascading promises
        });
  });
};
