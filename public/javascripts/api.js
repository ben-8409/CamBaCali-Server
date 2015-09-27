var api = (function () {
  'use strict';

  if (self.fetch) {
    console.log('fetch() supported');
    // run my fetch request here
  } else {
    console.log('Use XMLHttpRequest fallback');
    // do something with XMLHttpRequest?
  }

  function getAsJson(url) {
    if (self.fetch) {
      return fetch(url).then(function (response) {
        return response.json();
      });
      // run my fetch request here
    } else {
      //see https://github.com/mdn/promises-test/blob/gh-pages/index.html
      return new Promise(function (resolve, reject) {
        var req = new XMLHttpRequest();
        req.open('GET', encodeURI(url));
        req.responseType = 'json';

        req.onload = function () {
          if (req.status === 200) {
            resolve(req.response);
          } else {
            reject(Error('Data didn\'t load; Error code:' + req.statusText));
          }
        };

        req.onerror = function () {
          reject(Error('Network errpr.'));
        };

        req.send();
      });
    }
  }

  function postAsJson(url, object) {
    if (self.fetch) {
      return fetch(url, {
        method: 'post',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(object)
      });
      // run my fetch request here
    } else {
      //see https://github.com/mdn/promises-test/blob/gh-pages/index.html
      return new Promise(function (resolve, reject) {
        var data = JSON.stringify(object);
        var req = new XMLHttpRequest();
        req.open('POST', encodeURI(url));
        req.setRequestHeader('Content-type', 'application/json');
        req.setRequestHeader('Content-length', data.length);
        req.responseType = 'text';

        req.onload = function () {
          if (req.status === 200) {
            resolve(req.response);
          } else {
            reject(req.response);
          }
        };

        req.onerror = function () {
          reject(req.response);
        };

        req.send(data);
      });
    }
  }
  
  /*function getAsJson(url, object) {
    if (self.fetch) {
      return fetch(url, {
        method: 'get',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(object)
      });
      // run my fetch request here
    } else {
      //see https://github.com/mdn/promises-test/blob/gh-pages/index.html
      return new Promise(function (resolve, reject) {
        var data = JSON.stringify(object);
        var req = new XMLHttpRequest();
        req.open('GET', encodeURI(url));
        req.setRequestHeader('Content-type', 'application/json');
        req.setRequestHeader('Content-length', data.length);
        req.responseType = 'text';

        req.onload = function () {
          if (req.status === 200) {
            resolve(req.response);
          } else {
            reject(req.response);
          }
        };

        req.onerror = function () {
          reject(req.response);
        };

        req.send(data);
      });
    }
  }*/

  function postForm(url, form) {
    var formData = new FormData(form);
    //console.log(JSON.stringify(formData));
    if (self.fetch) {
      return fetch(url, {
        method: 'post',
        /*headers: {
          'Content-Type': 'application/json'
        },*/
        body: formData
      });
      // run my fetch request here
    } else {
      //see https://github.com/mdn/promises-test/blob/gh-pages/index.html
      return new Promise(function (resolve, reject) {
        var req = new XMLHttpRequest();
        req.open('POST', encodeURI(url));
        //req.setRequestHeader('Content-type', 'application/json');
        req.responseType = 'text';

        req.onload = function () {
          if (req.status === 200) {
            resolve(req.response);
          } else {
            reject(req.response);
          }
        };

        req.onerror = function () {
          reject(req.response);
        };

        req.send(formData);
      });
    }
  }

  function getResultsWithReference(uuid, screen) {
    var url = window.location.origin + '/api/results/' + uuid + '/reference/' + screen;
    return getAsJson(url);
  }

  function setColor(color, screen) {
    var url = window.location.origin + '/api/screens';
    if (screen && screen !== '') {
      url += '/' + screen;
    }
    url += '/setColor';
    return postAsJson(url, color);
  }

  function setBrightnessCorrection(correction, screen) {
    var url = window.location.origin + '/api';
    url += '/screens/' + screen;
    url += '/setBrightnessCorrection';
    return postAsJson(url, correction);
  }

  function setReference(referenceAndResult) {
    return postAsJson(window.location.origin + '/api/calibration/setReference', referenceAndResult);
  }

  return {
    getResultsWithReference: getResultsWithReference,
    postAsJson: postAsJson,
    getAsJson: getAsJson,
    postForm: postForm,
    setBrightnessCorrection: setBrightnessCorrection,
    setColor: setColor,
    setReference: setReference
  };
})();
