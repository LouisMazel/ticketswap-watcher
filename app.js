'use strict';

const co = require('co');
const request = require('co-request');
const cheerio = require('cheerio');
const _ = require('lodash');
const notifier = require('node-notifier');
const exec = require('child_process').exec;

const HOST = 'https://www.ticketswap.com';
const EVENT_URL = '/event/we-love-green-2018/saturday/d5b8946f-67bf-4726-96f4-b58f479f3004/671316';
const CHECK_INTERVAL_MIN = 30000
const CHECK_INTERVAL_MAX = 60000

let cookieJar = request.jar();

let randomIntFromInterval = function(min,max) {
	return Math.floor(Math.random()*(max-min+1)+min);
}

let buildRequest = function (uri, method) {
  console.log(`Fetching: ${uri}`);

  return request({
    uri: uri,
    method: method,
    jar: cookieJar,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.71 Safari/537.36',
    }
  });
};

let fetchResult = function (link) {
  return co(function* () {
    let result = yield buildRequest(link, 'GET');

    return cheerio.load(result.body);
  });
};

let botAction = {
  robotCheck: function (url) {
    console.log(`${url} : ---> Need to visit and check if you are block as robot`);
    return notifier.notify({
      'title': 'Need check as robot',
      'message': url,
      'open': url,
    });
  },
  availableTicket: function (url, data) {
    console.log(`${url} : ---> ${data} available`);
    exec(`open ${url}`);
    return notifier.notify({
      'title': 'New ticket!!!',
      'message': url,
      'open': url,
    });
  },
  unavailableTicket: function (url, data) {
    console.log(`${url} : ---> Not available`);
    return false;
  }
};

let app = function () {
  return co(function* () {
    let result = yield buildRequest(HOST + EVENT_URL, 'GET');

    let $ = cheerio.load(result.body);
    let hasData = false;
    let linksFn = {};

    if ($('.events-list--item a').length > 0) {
      $('.events-list--item a').each((index, link) => {
        let fetchUrl = HOST + _.get(link, 'attribs.href');
        linksFn[fetchUrl] = fetchResult(fetchUrl);
      });
    } else {
      linksFn[HOST + EVENT_URL] = Promise.resolve($);
    }

    let linksResults = yield linksFn;

    _.each(linksResults, function ($query, url) {
      let counterValue = $query('.counter-available .counter-value').text();

      if ($query('#recaptcha').length > 0) {
        return botAction.robotCheck(url);
      }
      if (parseInt(counterValue, 10) === 1) {
        let fetchResultAvailable = function (link) {
          return co(function* () {
            let availableOffer = yield buildRequest(HOST + $query('.listings-item--title a').attr('href'), 'GET');
            let $ = cheerio.load(availableOffer.body);
            if ($('.listing-unavailable').length) {
              return botAction.unavailableTicket(HOST + $query('.listings-item--title a').attr('href'));
            } else {
              return botAction.availableTicket(HOST + $query('.listings-item--title a').attr('href'), '1');
            }
          });
        };
        return fetchResultAvailable()
      }

      if (parseInt(counterValue, 10) > 0) {
        return botAction.availableTicket(url, counterValue);
      }
      return botAction.unavailableTicket(url);
    });

    return true;
  }).catch(ex => {
    console.log(ex);
  });
};

app();
setInterval(app, randomIntFromInterval(CHECK_INTERVAL_MIN, CHECK_INTERVAL_MAX));
