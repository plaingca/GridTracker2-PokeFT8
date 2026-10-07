// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Button panel: building it, ordering and drag-and-drop (moved from GridTracker2.js)

function buttonPanelInit()
{
  let iconButtons = buttonsDiv.querySelectorAll(".iconButton");

  for (let i = 0; i < iconButtons.length; i++)
  {
    GT.defaultButtons[i] = iconButtons[i].id;

    iconButtons[i].addEventListener("dragstart", buttonDragStart);
    iconButtons[i].draggable = true;
  }

  if (GT.settings.app.buttonPanelOrder.length > 0)
  {
    // First make sure that all the saved buttons exist.
    let i = GT.settings.app.buttonPanelOrder.length;
    while (i--)
    {
      if (document.getElementById(GT.settings.app.buttonPanelOrder[i]) == null)
      {
        GT.settings.app.buttonPanelOrder.splice(i, 1);
      }
    }

    for (let i = 0; i < GT.defaultButtons.length; i++)
    {
      if (GT.settings.app.buttonPanelOrder.indexOf(GT.defaultButtons[i]) == -1)
      {
        GT.settings.app.buttonPanelOrder.push(GT.defaultButtons[i]);
      }
    }

    setButtonPanelOrder(GT.settings.app.buttonPanelOrder);
  }
  else
  {
    GT.settings.app.buttonPanelOrder = [...GT.defaultButtons];
  }
}

function setButtonPanelOrder(which)
{
  let buttonObjects = {};
  let iconButtons = buttonsDiv.querySelectorAll(".iconButton");

  // Save a point to each button element so we don't destroy it
  for (let i = 0; i < iconButtons.length; i++)
  {
    buttonObjects[iconButtons[i].id] = iconButtons[i];
  }

  // Clear the button panel
  while (buttonsDiv.lastElementChild)
  {
    buttonsDiv.removeChild(buttonsDiv.lastElementChild);
  }

  // Append each button by its order
  for (let i = 0; i < which.length; i++)
  {
    buttonsDiv.appendChild(buttonObjects[which[i]]);
  }
  saveButtonOrder();
}

function buttonDragStart(event)
{
  event.dataTransfer.setData("Button", event.target.id);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.dropEffect = "move";
}

function onButtonDrop(event)
{
  if (event.target.draggable)
  {
    let dragElement = document.getElementById( event.dataTransfer.getData("Button"));
    let target = event.target;
    let parent = event.target.parentNode;
    while (parent != buttonsDiv)
    {
      target = parent;
      parent = target.parentNode;
    }

    let movingButton = GT.settings.app.buttonPanelOrder.indexOf(dragElement.id);
    let targetButton = GT.settings.app.buttonPanelOrder.indexOf(target.id);


    if (target.nextElementSibling)
    {
      if (movingButton < targetButton)
      {
        parent.insertBefore(dragElement, target.nextElementSibling);
      }
      else
      {
        parent.insertBefore(dragElement, target);
      }
    }
    else
    {
      parent.appendChild(dragElement);
    }

    saveButtonOrder();
    event.preventDefault();
  }
}

function saveButtonOrder()
{
  let iconButtons = buttonsDiv.querySelectorAll("[class^='iconButton']");
  GT.settings.app.buttonPanelOrder = [];
  for (let i = 0; i < iconButtons.length; i++)
  {
    GT.settings.app.buttonPanelOrder[i] = iconButtons[i].id;
  }
}
