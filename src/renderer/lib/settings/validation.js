// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Settings: input validation for ports, IP addresses, multicast, callsigns and grids (moved from GridTracker2.js)

function CheckReceivePortIsNotForwardPort(value)
{
  if (udpForwardIpInput.value.indexOf("127.0.0.1") > -1 && udpForwardPortInput.value == value && GT.settings.app.wsjtIP == "" && udpForwardEnable.checked)
  {
    return false;
  }

  return true;
}

function CheckForwardPortIsNotReceivePort(value)
{
  if (udpForwardIpInput.value.indexOf("127.0.0.1") > -1 && udpPortInput.value == value && GT.settings.app.wsjtIP == "")
  {
    return false;
  }

  return true;
}

function CheckAdifBroadcastPortIsNotReceivePort(value)
{
  if (GT.settings.app.adifBroadcastMulticast == false && GT.settings.app.multicast == false && udpPortInput.value == value)
  {
    return false;
  }
  if (GT.settings.app.adifBroadcastIP == GT.settings.app.wsjtIP && udpPortInput.value == value)
  {
    return false;
  }
  return true;
}

function validIpKeys(value)
{
  if (value == 46) return true;
  return value >= 48 && value <= 57;
}

function validIpsKeys(value)
{
  if (value == 44) return true;
  if (value == 46) return true;
  return value >= 48 && value <= 57;
}

function validNumberKeys(value)
{
  return value >= 48 && value <= 57;
}

function validateNumAndLetter(input)
{
  if (/\d/.test(input) && /[A-Z]/.test(input)) return true;
  else return false;
}

function validCallsignsKeys(value)
{
  if (value == 44) return true;
  if (value >= 47 && value <= 57) return true;
  if (value >= 65 && value <= 90) return true;
  return value >= 97 && value <= 122;
}

function validGridKeys(value)
{
  if (value == 44) return true;
  if (value >= 48 && value <= 57) return true;
  if (value >= 65 && value <= 90) return true;
  return value >= 97 && value <= 122;
}

function setInputStatus(input, valid, validDiv, validTxt = "Valid!", invalidTxt = "Invalid!") {
  input.style.color = valid ? "#FF0" : (input.value ? "#FFF" : "#000");
  input.style.backgroundColor = valid ? "darkblue" : (input.value ? "rgb(199, 113, 0)" : "yellow");
  if (validDiv) validDiv.innerHTML = valid ? validTxt : invalidTxt;
  return valid;
}

function ValidateCallsigns(inputText) {
  inputText.value = inputText.value.toUpperCase();
  let calls = inputText.value.split(",").map(c => c.trim()).filter(c => c);
  let passed = calls.length > 0 && calls.every(c => /\d/.test(c) && /[A-Z]/.test(c));
  return setInputStatus(inputText, passed, null);
}

function ValidateGrids(inputText) {
  inputText.value = inputText.value.toUpperCase();
  let grids = inputText.value.split(",").map(g => g.trim()).filter(g => g);
  let passed = grids.length > 0 && grids.every(g => /^[A-R]{2}[0-9]{2}$/.test(g));
  return setInputStatus(inputText, passed, null);
}

function ValidateCallsign(inputText, validDiv) {
  if (validDiv) validDiv.innerHTML = "";
  inputText.value = inputText.value.toUpperCase();
  let passed = inputText.value.length > 0 && (/\d/.test(inputText.value) || /[A-Z]/.test(inputText.value));
  inputText.style.color = passed ? "#FF0" : "#000";
  inputText.style.backgroundColor = passed ? "darkblue" : "yellow";
  if (validDiv) validDiv.innerHTML = passed ? "Valid!" : "Invalid!";
  return passed;
}

function ValidateGridsquareOnly4(inputText, validDiv) {
  inputText.value = inputText.value.toUpperCase();
  let passed = inputText.value.length === 0 || /^[A-R]{2}[0-9]{2}$/.test(inputText.value);
  inputText.style.color = passed ? (inputText.value.length ? "#FF0" : "#000") : "#FFF";
  inputText.style.backgroundColor = passed ? (inputText.value.length ? "darkblue" : "yellow") : "rgb(199, 113, 0)";
  if (validDiv) validDiv.innerHTML = passed ? "Valid!" : "Invalid!";
  return passed;
}

function ValidateGridsquare(inputText, validDiv) {
  inputText.value = inputText.value.toUpperCase();
  let passed = /^[A-R]{2}[0-9]{2}([A-X]{2})?$/.test(inputText.value);
  return setInputStatus(inputText, passed, validDiv);
}

function ValidateIPaddress(inputText, checkBox) {
  let ip = inputText.value.trim();
  let valid = GT.ipformat.test(ip) && ip !== "0.0.0.0" && ip !== "255.255.255.255";
  if (!valid && checkBox) checkBox.checked = false;
  return setInputStatus(inputText, valid, null);
}

function ValidateIPaddresses(inputText, checkBox) {
  let ips = inputText.value.split(",").map(i => i.trim()).filter(i => i);
  let valid = ips.length > 0 && ips.every(ip => GT.ipformat.test(ip) && ip !== "0.0.0.0" && ip !== "255.255.255.255");
  if (!valid && checkBox) checkBox.checked = false;
  return setInputStatus(inputText, valid, null);
}

function ipToInt(ip)
{
  return ip
    .split(".")
    .map((octet, index, array) =>
    {
      return parseInt(octet) * Math.pow(256, array.length - index - 1);
    })
    .reduce((prev, curr) =>
    {
      return prev + curr;
    });
}

function ValidateMulticast(inputText)
{
  if (inputText.value.match(GT.ipformat))
  {
    if (inputText.value != "0.0.0.0" && inputText.value != "255.255.255.255")
    {
      let ipInt = ipToInt(inputText.value);
      if (ipInt >= ipToInt("224.0.0.0") && ipInt < ipToInt("240.0.0.0"))
      {
        if (ipInt > ipToInt("224.0.0.255"))
        {
          inputText.style.color = "black";
          inputText.style.backgroundColor = "yellow";
        }
        else
        {
          inputText.style.color = "#FF0";
          inputText.style.backgroundColor = "darkblue";
        }
        return true;
      }
      else
      {
        inputText.style.color = "#FFF";
        inputText.style.backgroundColor = "rgb(199, 113, 0)";
        return false;
      }
    }
    else
    {
      inputText.style.color = "#FFF";
      inputText.style.backgroundColor = "rgb(199, 113, 0)";
      return false;
    }
  }
  else
  {
    inputText.style.color = "#FFF";
    inputText.style.backgroundColor = "rgb(199, 113, 0)";
    return false;
  }
}

function ValidatePort(inputText, checkBox, callBackCheck)
{
  let value = Number(inputText.value);
  if (value > 1023 && value < 65536)
  {
    if (callBackCheck && !callBackCheck(value))
    {
      inputText.style.color = "#FFF";
      inputText.style.backgroundColor = "orange";
      if (checkBox) checkBox.checked = false;
      return false;
    }
    else
    {
      inputText.style.color = "#FF0";
      inputText.style.backgroundColor = "darkblue";
      return true;
    }
  }
  else
  {
    inputText.style.color = "#FFF";
    inputText.style.backgroundColor = "orange";
    if (checkBox) checkBox.checked = false;
    return false;
  }
}
