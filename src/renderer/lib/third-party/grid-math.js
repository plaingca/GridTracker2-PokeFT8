// Copyright © 2023 N7YHF
// Permission granted to GridTracker.org for use.

function fieldNumberToLetter(number)
{
  return String.fromCharCode(number + 65);
}

// Input already uppercased
function squareToNeighbors(square)
{
  const neighborMatrix = [
    [-1, +1], // NW
    [0, +1], // N
    [+1, +1], // NE

    [-1, 0], // W
    [0, 0], // Self
    [+1, 0], // E

    [-1, -1], // SW
    [0, -1], // S
    [+1, -1] // SE
  ];

  // RL90
  // ^^---- RL is the "field"
  //   ^^---- 90 is the "square"

  const fieldX = square.charCodeAt(0) - 65;
  const fieldY = square.charCodeAt(1) - 65;

  const squareX = square.charCodeAt(2) - 48;
  const squareY = square.charCodeAt(3) - 48;

  const neighbors = [];

  for (const [dx, dy] of neighborMatrix)
  {
    let neighborFieldX = fieldX;
    let neighborFieldY = fieldY;

    let neighborSquareX = squareX + dx;
    let neighborSquareY = squareY + dy;

    if (neighborSquareX < 0)
    {
      neighborSquareX += 10;
      neighborFieldX -= 1;
    }
    else if (neighborSquareX > 9)
    {
      neighborSquareX -= 10;
      neighborFieldX += 1;
    }

    if (neighborSquareY < 0)
    {
      neighborSquareY += 10;
      neighborFieldY -= 1;
    }
    else if (neighborSquareY > 9)
    {
      neighborSquareY -= 10;
      neighborFieldY += 1;
    }

    if (neighborFieldX < 0)
    {
      neighborFieldX += 18;
    }
    else if (neighborFieldX > 17)
    {
      neighborFieldX -= 18;
    }

    if (neighborFieldY < 0 || neighborFieldY > 17)
    {
      continue;
    }

    const neighbor = `${fieldNumberToLetter(neighborFieldX)}${fieldNumberToLetter(neighborFieldY)}${neighborSquareX}${neighborSquareY}`;

    neighbors.push(neighbor);
  }

  return neighbors;
}
