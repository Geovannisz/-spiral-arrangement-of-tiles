// ==================== Parâmetros do Tile ====================
const dx = 176.0695885;
const dy = 167.5843071;
const N = 2;
const M = 8;

// Cria o array do tile
let tile_array = createPlanarArray(dx, dy, N, M);
tile_array = tile_array.map(point => [point[0] - tile_array.reduce((sum, p) => sum + p[0], 0) / tile_array.length, point[1] - tile_array.reduce((sum, p) => sum + p[1], 0) / tile_array.length]);

const tile_size_x = Math.max(...tile_array.map(p => p[0])) - Math.min(...tile_array.map(p => p[0]));
const tile_size_y = Math.max(...tile_array.map(p => p[1])) - Math.min(...tile_array.map(p => p[1]));
const tile_size = Math.sqrt(tile_size_x ** 2 + tile_size_y ** 2);

function createPlanarArray(dx, dy, N, M) {
    const array = [];
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < M; j++) {
            array.push([i * dx, j * dy]);
        }
    }
    return array;
}

function rotatePoints(points, angle) {
    const R = [
        [Math.cos(angle), -Math.sin(angle)],
        [Math.sin(angle), Math.cos(angle)]
    ];
    return points.map(point => [
        point[0] * R[0][0] + point[1] * R[0][1],
        point[0] * R[1][0] + point[1] * R[1][1]
    ]);
}

function isCollision(tile1_center, tile1_angle, tile2_center, tile2_angle, tile_array) {
    const tile_size_x = Math.max(...tile_array.map(p => p[0])) - Math.min(...tile_array.map(p => p[0]));
    const tile_size_y = Math.max(...tile_array.map(p => p[1])) - Math.min(...tile_array.map(p => p[1]));

    function createHitbox(center, angle, size_x, size_y) {
        const half_x = size_x / 2;
        const half_y = size_y / 2;

        let corners = [
            [-half_x, -half_y],
            [half_x, -half_y],
            [half_x, half_y],
            [-half_x, half_y]
        ];

        const rotated_corners = rotatePoints(corners, angle);
        return rotated_corners.map(corner => [corner[0] + center[0], corner[1] + center[1]]);
    }

    const hitbox1 = createHitbox(tile1_center, tile1_angle, tile_size_x, tile_size_y);
    const hitbox2 = createHitbox(tile2_center, tile2_angle, tile_size_x, tile_size_y);

    function separatingAxis(hitbox1, hitbox2) {
        for (let i = 0; i < 4; i++) {
            const edge = [hitbox1[(i + 1) % 4][0] - hitbox1[i][0], hitbox1[(i + 1) % 4][1] - hitbox1[i][1]];
            const axis = [-edge[1], edge[0]];

            const projection1 = hitbox1.map(point => point[0] * axis[0] + point[1] * axis[1]);
            const projection2 = hitbox2.map(point => point[0] * axis[0] + point[1] * axis[1]);

            const min1 = Math.min(...projection1);
            const max1 = Math.max(...projection1);
            const min2 = Math.min(...projection2);
            const max2 = Math.max(...projection2);

            if (max1 < min2 || max2 < min1) {
                return true;
            }
        }
        return false;
    }

    // Verifica se há colisão
    if (!(separatingAxis(hitbox1, hitbox2) || separatingAxis(hitbox2, hitbox1))) {
        // Se houver colisão, calcula o centro do tile
        const tileCenter = [(hitbox2[0][0] + hitbox2[2][0]) / 2, (hitbox2[0][1] + hitbox2[2][1]) / 2];
        
        // Retorna true para indicar colisão, e as coordenadas do centro do tile
        return { collision: true, tileCenter: tileCenter };
    }

    // Se não houver colisão, retorna false e null para as coordenadas do centro
    return { collision: false, tileCenter: null };
}

function createStationArray(tiles_config, tile_array) {
    const array_tot = [];
    const collision_messages = [];
    const tile_array_centered = tile_array.map(point => [
        point[0] - tile_array.reduce((sum, p) => sum + p[0], 0) / tile_array.length,
        point[1] - tile_array.reduce((sum, p) => sum + p[1], 0) / tile_array.length
    ]);

    for (let i = 0; i < tiles_config.length; i++) {
        const tile_center = tiles_config[i][0];
        const tile_angle = tiles_config[i][1];
        let valid_position = true;
        let collisionInfo = null;

        for (let j = 0; j < i; j++) {
            const existing_tile_center = tiles_config[j][0];
            const existing_tile_angle = tiles_config[j][1];
            collisionInfo = isCollision(tile_center, tile_angle, existing_tile_center, existing_tile_angle, tile_array);
            if (collisionInfo.collision) {
                valid_position = false;
                break;
            }
        }

        if (valid_position) {
            const rotated_tile = rotatePoints(tile_array_centered, tile_angle);
            const translated_tile = rotated_tile.map(point => [point[0] + tile_center[0], point[1] + tile_center[1]]);
            translated_tile.forEach(point => array_tot.push([...point, 0]));
        } else {
            collision_messages.push(`Colisão detectada no tile ${i + 1}. Coordenadas do centro: (${collisionInfo.tileCenter[0].toFixed(2)}, ${collisionInfo.tileCenter[1].toFixed(2)}). Posição ignorada.`);
        }
    }

    return [array_tot, collision_messages];
}

function generateSpiralTileArrangement(
    num_spirals = 6,
    tiles_per_spiral = 5,
    base_radius = 2.0,
    radius_growth_factor = 1.5,
    angle_offset_factor = 1 / 12,
    angle_variation_factor = 0.0,
    exponential_radius_factor = 0.0,
    exponential_angle_factor = 0.0,
    rotation_per_spiral = 0.0,
    center_tile = true,
    station_name = ''
) {
    const tile_arrangement = [];

    if (center_tile) {
        tile_arrangement.push([[0, 0], 0]);
    }

    for (let p = 0; p < num_spirals; p++) {
        const spiral_angle = p * (2 * Math.PI / num_spirals) + p * rotation_per_spiral;
        for (let i = 0; i < tiles_per_spiral; i++) {
            const r = (base_radius + i * radius_growth_factor) * (1 + exponential_radius_factor) ** i;
            const angle = (spiral_angle + i * Math.PI * angle_offset_factor + i * angle_variation_factor) * (1 + exponential_angle_factor) ** i;

            const x = r * Math.cos(angle);
            const y = r * Math.sin(angle);
            const orientation_angle = angle + Math.PI / 2;

            tile_arrangement.push([[x, y], orientation_angle]);
        }
    }

    return tile_arrangement;
}

function generatePlot() {
    const numSpirals = parseFloat(document.getElementById('num_spirals').value);
    const tilesPerSpiral = parseFloat(document.getElementById('tiles_per_spiral').value);
    const baseRadius = parseFloat(document.getElementById('base_radius').value);
    const radiusGrowthFactor = parseFloat(document.getElementById('radius_growth_factor').value);
    const angleOffsetFactor = parseFloat(document.getElementById('angle_offset_factor').value);
    const angleVariationFactor = parseFloat(document.getElementById('angle_variation_factor').value);
    const exponentialRadiusFactor = parseFloat(document.getElementById('exponential_radius_factor').value);
    const exponentialAngleFactor = parseFloat(document.getElementById('exponential_angle_factor').value);
    const rotationPerSpiral = parseFloat(document.getElementById('rotation_per_spiral').value);
    const centerTile = document.getElementById('center_tile').checked;
    const stationName = document.getElementById('station_name').value;

    // Adaptação dos parâmetros para a função
    const adaptedBaseRadius = baseRadius * tile_size;
    const adaptedRadiusGrowthFactor = radiusGrowthFactor * tile_size;

    const tileArrangement = generateSpiralTileArrangement(
        numSpirals,
        tilesPerSpiral,
        adaptedBaseRadius,
        adaptedRadiusGrowthFactor,
        angleOffsetFactor,
        angleVariationFactor,
        exponentialRadiusFactor,
        exponentialAngleFactor,
        rotationPerSpiral,
        centerTile,
        stationName
    );

    const [station, collisionMessages] = createStationArray(tileArrangement, tile_array);

    displayPlot(station, collisionMessages, stationName);
    updateCodeSnippet();
}

function displayPlot(stationData, collisionMessages, stationName) {
    const xValues = stationData.map(point => point[0]);
    const yValues = stationData.map(point => point[1]);

    const plotData = [{
        x: xValues,
        y: yValues,
        mode: 'markers',
        type: 'scatter'
    }];

    const layout = {
        title: stationName,
        autosize: true,
        xaxis: {
            scaleanchor: "y",
            scaleratio: 1
        },
        yaxis: {
            scaleanchor: "x",
            scaleratio: 1
        }
    };

    Plotly.newPlot('plot', plotData, layout);

    // Exibe mensagens de colisão
    const messageContainer = document.getElementById('message-container');
    messageContainer.innerHTML = '';
    if (collisionMessages && collisionMessages.length > 0) {
        collisionMessages.forEach(message => {
            displayMessage(message, 'warning');
        });
    } else {
        displayMessage('Nenhuma colisão detectada.', 'success');
    }
}

function displayMessage(message, type) {
    const messageContainer = document.getElementById('message-container');
    const div = document.createElement('div');
    div.className = `message ${type === 'success' ? 'success' : ''}`;
    div.textContent = message;
    messageContainer.appendChild(div);
}

function updateCodeSnippet() {
    const numSpirals = document.getElementById('num_spirals').value;
    const tilesPerSpiral = document.getElementById('tiles_per_spiral').value;
    const baseRadius = document.getElementById('base_radius').value;
    const radiusGrowthFactor = document.getElementById('radius_growth_factor').value;
    const angleOffsetFactor = document.getElementById('angle_offset_factor').value;
    const angleVariationFactor = document.getElementById('angle_variation_factor').value;
    const exponentialRadiusFactor = document.getElementById('exponential_radius_factor').value;
    const exponentialAngleFactor = document.getElementById('exponential_angle_factor').value;
    const rotationPerSpiral = document.getElementById('rotation_per_spiral').value;
    const centerTile = document.getElementById('center_tile').checked;
    const stationName = document.getElementById('station_name').value;

    const snippet = `array_tiles_station = generate_spiral_tile_arrangement(
num_spirals=${numSpirals},
tiles_per_spiral=${tilesPerSpiral},
base_radius=${baseRadius} * tile_size,
radius_growth_factor=${radiusGrowthFactor} * tile_size,
angle_offset_factor=${angleOffsetFactor},
angle_variation_factor=${angleVariationFactor},
exponential_radius_factor=${exponentialRadiusFactor},
exponential_angle_factor=${exponentialAngleFactor},
rotation_per_spiral=${rotationPerSpiral},
center_tile=${centerTile ? 'True' : 'False'},
station_name='${stationName}'
)`;
    document.getElementById('code-snippet').value = snippet;
}

let copyIconTimeout;

function copySnippet() {
    const snippetTextarea = document.getElementById('code-snippet');
    snippetTextarea.select();
    document.execCommand('copy');

    const copyButton = document.querySelector('.copy-button i');
    copyButton.classList.remove('fa-paste');
    copyButton.classList.add('fa-check');

    clearTimeout(copyIconTimeout);
    copyIconTimeout = setTimeout(() => {
        copyButton.classList.remove('fa-check');
        copyButton.classList.add('fa-paste');
    }, 2000);
}

// ==================== Funções para o cálculo do Campo Elétrico ====================

async function readTable(file) {
  const response = await fetch(file);
  const csvData = await response.text();
  const parsedData = Papa.parse(csvData, { header: true }).data;

  const data = parsedData.map(row => {
    for (const col in row) {
      if (row[col] === 'NaN') {
        row[col] = '0';
      }
    }

    const reETheta_mV = parseFloat(row['re(rETheta) [mV]'] || '0');
    const imETheta_mV = parseFloat(row['im(rETheta) [mV]'] || '0');
    const reEPhi_mV = parseFloat(row['re(rEPhi) [mV]'] || '0');
    const imEPhi_mV = parseFloat(row['im(rEPhi) [mV]'] || '0');

    const reETheta_V = reETheta_mV * 1e-3;
    const imETheta_V = imETheta_mV * 1e-3;
    const reEPhi_V = reEPhi_mV * 1e-3;
    const imEPhi_V = imEPhi_mV * 1e-3;

    const rETheta_V = math.complex(reETheta_V, imETheta_V);
    const rEPhi_V = math.complex(reEPhi_V, imEPhi_V);

    const rETotal_V = math.sqrt(math.add(math.square(math.abs(rETheta_V)), math.square(math.abs(rEPhi_V))));

    return {
      'Theta [deg]': parseFloat(row['Theta [deg]'] || '0'),
      'Phi [deg]': parseFloat(row['Phi [deg]'] || '0'),
      'rETheta [V]': rETheta_V,
      'rEPhi [V]': rEPhi_V,
      'rETotal [V]': rETotal_V
    };
  });

  return data;
}

function computeAF(theta, phi, array, k = 2 * Math.PI / 300, theta_0 = 0, phi_0 = 0, centralize = true, initial_phase = null, normalize = false) {
  const thetaRad = theta.map(t => t * Math.PI / 180);
  const phiRad = phi.map(p => p * Math.PI / 180);
  const theta0Rad = theta_0 * Math.PI / 180;
  const phi0Rad = phi_0 * Math.PI / 180;

  const scanVector = [Math.sin(theta0Rad) * Math.cos(phi0Rad), Math.sin(theta0Rad) * Math.sin(phi0Rad), Math.cos(theta0Rad)];

  if (centralize) {
    const centerX = array.reduce((sum, p) => sum + p[0], 0) / array.length;
    const centerY = array.reduce((sum, p) => sum + p[1], 0) / array.length;
    const centerZ = array.reduce((sum, p) => sum + p[2], 0) / array.length;
    array = array.map(p => [p[0] - centerX, p[1] - centerY, p[2] - centerZ]);
  }

  const obsVectors = [];
  for (let i = 0; i < thetaRad.length; i++) {
    obsVectors.push([Math.sin(thetaRad[i]) * Math.cos(phiRad[i]), Math.sin(thetaRad[i]) * Math.sin(phiRad[i]), Math.cos(thetaRad[i])]);
  }

  const diffs = obsVectors.map(obs => [obs[0] - scanVector[0], obs[1] - scanVector[1], obs[2] - scanVector[2]]);

  let AF = [];
  if (initial_phase === null) {
    for (let i = 0; i < diffs.length; i++) {
      let sum = 0;
      for (let j = 0; j < array.length; j++) {
        const phase = k * (diffs[i][0] * array[j][0] + diffs[i][1] * array[j][1] + diffs[i][2] * array[j][2]);
        sum += Math.cos(phase) + Math.sin(phase) * 1j;
      }
      AF.push(sum);
    }
  } else {
    const initialPhaseRad = initial_phase.map(p => p * Math.PI / 180);
    for (let i = 0; i < diffs.length; i++) {
      let sum = 0;
      for (let j = 0; j < array.length; j++) {
        const phase = k * (diffs[i][0] * array[j][0] + diffs[i][1] * array[j][1] + diffs[i][2] * array[j][2]) + initialPhaseRad[j];
        sum += Math.cos(phase) + Math.sin(phase) * 1j;
      }
      
      AF.push(sum);
    }
  }

  if (normalize) {
    AF = AF.map(af => math.divide(af, array.length));
  }

  return AF;
}

function rotateField(data, angleRad) {
  const angleDeg = angleRad * 180 / Math.PI;
  const rotatedData = JSON.parse(JSON.stringify(data));

  for (let i = 0; i < rotatedData.length; i++) {
    if (rotatedData[i]['Theta [deg]'] === angleDeg) {
      const rETheta = rotatedData[i]['rETheta [V]'];
      const rEPhi = rotatedData[i]['rEPhi [V]'];

      const rotationMatrix = [
        [Math.cos(angleRad), -Math.sin(angleRad)],
        [Math.sin(angleRad), Math.cos(angleRad)]
      ];

      const rotatedComponents = math.multiply(rotationMatrix, [rETheta, rEPhi]);

      rotatedData[i]['rETheta [V]'] = rotatedComponents[0];
      rotatedData[i]['rEPhi [V]'] = rotatedComponents[1];
      rotatedData[i]['rETotal [V]'] = math.sqrt(math.add(math.square(math.abs(rotatedComponents[0])), math.square(math.abs(rotatedComponents[1]))));
    }
  }

  return rotatedData;
}

function applyAFOnField(field, AF, rotatedFields) {
  const outField = JSON.parse(JSON.stringify(field));

  for (let i = 0; i < outField.length; i++) {
    outField[i]['rETheta [V]'] = math.complex(0, 0);
    outField[i]['rEPhi [V]'] = math.complex(0, 0);

    for (let j = 0; j < rotatedFields.length; j++) {
      const rotatedField = rotatedFields[j];
      
      // Encontra o índice correspondente no rotatedField
      const fieldIndex = rotatedField.findIndex(row => row['Theta [deg]'] === field[i]['Theta [deg]'] && row['Phi [deg]'] === field[i]['Phi [deg]']);

      if (fieldIndex !== -1) {
        outField[i]['rETheta [V]'] = math.add(outField[i]['rETheta [V]'], math.multiply(rotatedField[fieldIndex]['rETheta [V]'], AF[i]));
        outField[i]['rEPhi [V]'] = math.add(outField[i]['rEPhi [V]'], math.multiply(rotatedField[fieldIndex]['rEPhi [V]'], AF[i]));
      }
    }

    outField[i]['rETotal [V]'] = math.sqrt(math.add(math.square(math.abs(outField[i]['rETheta [V]'])), math.square(math.abs(outField[i]['rEPhi [V]']))));
  }

  return outField;
}

function calculateSLL(theta, af) {
  const mainPeakIndex = theta.indexOf(0);
  const mainPeakValue = af[mainPeakIndex];

  let peaks = [];
  for (let i = 1; i < af.length - 1; i++) {
    if (af[i] > af[i - 1] && af[i] > af[i + 1] && i !== mainPeakIndex) {
      peaks.push(af[i]);
    }
  }

  peaks.sort((a, b) => b - a);

  if (peaks.length < 1) {
    console.log("Não foi possível calcular o SLL: Menos de dois picos encontrados.");
    return null;
  }

  const sll = peaks.length >= 1 ? math.abs(peaks[0]) / math.abs(mainPeakValue) : 0;
  const sll_dB = 20 * Math.log10(sll);

  return sll_dB;
}

async function generateGraph() {
  const stationName = document.getElementById('station_name').value;
  const phiAngle = parseFloat(document.getElementById('phi_angle').value);

  const numSpirals = parseFloat(document.getElementById('num_spirals').value);
  const tilesPerSpiral = parseFloat(document.getElementById('tiles_per_spiral').value);
  const baseRadius = parseFloat(document.getElementById('base_radius').value);
  const radiusGrowthFactor = parseFloat(document.getElementById('radius_growth_factor').value);
  const angleOffsetFactor = parseFloat(document.getElementById('angle_offset_factor').value);
  const angleVariationFactor = parseFloat(document.getElementById('angle_variation_factor').value);
  const exponentialRadiusFactor = parseFloat(document.getElementById('exponential_radius_factor').value);
  const exponentialAngleFactor = parseFloat(document.getElementById('exponential_angle_factor').value);
  const rotationPerSpiral = parseFloat(document.getElementById('rotation_per_spiral').value);
  const centerTile = document.getElementById('center_tile').checked;

  // Adaptação dos parâmetros para a função
  const adaptedBaseRadius = baseRadius * tile_size;
  const adaptedRadiusGrowthFactor = radiusGrowthFactor * tile_size;

  const tileArrangement = generateSpiralTileArrangement(
      numSpirals,
      tilesPerSpiral,
      adaptedBaseRadius,
      adaptedRadiusGrowthFactor,
      angleOffsetFactor,
      angleVariationFactor,
      exponentialRadiusFactor,
      exponentialAngleFactor,
      rotationPerSpiral,
      centerTile,
      stationName
  );

  const [station, collisionMessages] = createStationArray(tileArrangement, tile_array);
  const totalTiles = station.length;

  const data = await readTable('https://geovannisz.github.io/spiral-arrangement-of-tiles/data/rE_table_vivaldi.csv');
  const theta = data.map(row => row['Theta [deg]']);
  const phi = data.map(row => row['Phi [deg]']);

  // Cria uma chave única para os inputs da função compute_AF
  const inputKey = JSON.stringify([theta, phi, station]);

  // Verifica se o resultado já está no cache
  let cache = localStorage.getItem('computeAFCache');
  cache = cache ? JSON.parse(cache) : {};

  let AF;
  if (cache[inputKey]) {
    console.log("Usando resultado do cache...");
    AF = cache[inputKey].map(val => math.complex(val.re, val.im));
  } else {
    console.log("Calculando AF...");
    AF = computeAF(theta, phi, station);
    // Armazena o resultado no cache
    cache[inputKey] = AF.map(val => ({ re: math.re(val), im: math.im(val) }));
    localStorage.setItem('computeAFCache', JSON.stringify(cache));
  }

  const rotatedFields = [];
  let processedTiles = 0;
  const progressBarContainer = document.getElementById('progress-bar-container');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');

  progressBarContainer.style.display = 'block';

  for (let i = 0; i < tileArrangement.length; i++) {
    const rotatedField = rotateField(data, tileArrangement[i][1]);
    rotatedFields.push(rotatedField);

    processedTiles++;
    const progress = (processedTiles / totalTiles) * 100;
    progressBar.style.width = `${progress}%`;
    progressText.innerText = `${progress.toFixed(0)}%`;
  }

  const appliedField = applyAFOnField(data, AF, rotatedFields);
  const filteredAppliedField = appliedField.filter(row => row['Phi [deg]'] === phiAngle && row['Theta [deg]'] >= -90 && row['Theta [deg]'] <= 90);
  const xValues = filteredAppliedField.map(row => row['Theta [deg]']);
  const yValues = filteredAppliedField.map(row => 20 * Math.log10(Math.abs(row['rETotal [V]'])));

  const trace = {
    x: xValues,
    y: yValues,
    mode: 'lines',
    type: 'scatter'
  };

  const layout = {
    title: `Campo Elétrico Aplicado (Phi = ${phiAngle}°)`,
    xaxis: { title: 'Theta (deg)' },
    yaxis: { title: 'rETotal (dBV)' },
    autosize: true,
  };

  Plotly.newPlot('graph-container', [trace], layout);

  progressBarContainer.style.display = 'none';

  // Calcula e exibe o SLL
  const afValues = xValues.map(angle => {
    const index = theta.indexOf(angle);
    return index !== -1 ? AF[index] : null;
  });

  const sll = calculateSLL(xValues, afValues.filter(val => val !== null));
  const sllDisplay = document.getElementById('sll-value');
  sllDisplay.innerText = `SLL: ${sll.toFixed(2)} dB`;

  // Atualiza a cor do fundo do SLL
  const sllRatio = (sll + 30) / 30; // Normaliza entre 0 e 1
  const red = 255 * (1 - sllRatio);
  const green = 255 * sllRatio;
  sllDisplay.style.backgroundColor = `rgb(${red}, ${green}, 0)`;
}