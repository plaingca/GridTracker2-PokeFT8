
function readLocaleFile(locale)
{
  if (locale in GT.languages)
  {
    try
    {
      GT.i18n = requireJson(GT.languages[locale]);
    }
    catch (e)
    {
      console.error("Failed to load: " + GT.languages[locale]);
      GT.i18n = {};
    }
  }
}

function loadI18n()
{
  readLocaleFile(GT.settings.app.locale);
  refreshI18NStrings();
}

function renderI18n()
{
  const elements = document.querySelectorAll("[data-i18n]");
  for (let x = 0; x < elements.length; x++)
  {
    const key = elements[x].getAttribute("data-i18n");
    if (key in GT.i18n)
    {
      if (key.endsWith(".hover"))
      {
        elements[x].title = GT.i18n[key];
      }
      else
      {
        elements[x].innerHTML = GT.i18n[key];
        if (key.endsWith(".label"))
        {
          let hover = key.replace(".label", ".hover");
          if (hover in GT.i18n)
          {
            elements[x].title = GT.i18n[hover];
          }
        }
      }
    }
    else
    {
      console.error("Missing Body I18N Key: ", key);
    }
  }
}

function I18N(key)
{
  if (key in GT.i18n)
  {
    return GT.i18n[key];
  }
  else
  {
    console.error("Missing Direct I18N Key: ", key);
    return key;
  }
}

function changeLocale()
{
  GT.settings.app.locale = languageLocale.value;
  renderI18n(GT.settings.app.locale);
  saveAndCloseApp(true);
}

function loadChildWindowI18n()
{
  renderI18n();
}

function loadRosterI18n()
{
  renderI18n();
  addControls();
}

function renderLocale()
{
  renderI18n();
}
