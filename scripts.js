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

// Cache para armazenar os resultados do AF
const computeAFCache = {};

// Carrega o cache do localStorage, se existir
const cachedData = localStorage.getItem('computeAFCache');
if (cachedData) {
    Object.assign(computeAFCache, JSON.parse(cachedData));
}

// Função para salvar o cache no localStorage
function saveCache() {
    localStorage.setItem('computeAFCache', JSON.stringify(computeAFCache));
}

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

async function generateFieldPlot() {
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

    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    progressContainer.style.display = 'block';
    progressBar.value = 0;
    progressText.innerText = '0%';

    const result = await computeAFAndField(station, phiAngle, (progress) => {
        progressBar.value = progress;
        progressText.innerText = `${progress}%`;
    });

    progressContainer.style.display = 'none';

    if (result) {
        displayFieldPlot(result.af, result.thetaValues, stationName, phiAngle);
        displaySLL(result.sll, result.af, result.thetaValues);
    }
}

async function readTable(file) {
    const response = await fetch(file);
    const csvData = await response.text();
    const parsedData = Papa.parse(csvData, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true
    }).data;

    // Converte milivolts para volts e calcula os componentes complexos
    const processedData = parsedData.map(row => {
        const newRow = { ...row };
        for (const col of ['re(rETheta)', 'im(rETheta)', 're(rEPhi)', 'im(rEPhi)']) {
            if (`${col} [mV]` in newRow) {
                newRow[`${col} [V]`] = newRow[`${col} [mV]`] * 1e-3;
                delete newRow[`${col} [mV]`];
            }
        }
        newRow['rETheta [V]'] = newRow['re(rETheta) [V]'] + numeric.mul(numeric.complex(0, 1), newRow['im(rETheta) [V]']);
        newRow['rEPhi [V]'] = newRow['re(rEPhi) [V]'] + numeric.mul(numeric.complex(0, 1), newRow['im(rEPhi) [V]']);
        newRow['rETotal [V]'] = numeric.sqrt(numeric.add(numeric.pow(numeric.abs(newRow['rETheta [V]']), 2), numeric.pow(numeric.abs(newRow['rEPhi [V]']), 2)));
        return newRow;
    });

    return processedData;
}

function rotateField(data, angleRad) {
    const rotatedData = JSON.parse(JSON.stringify(data)); // Deep copy
    const angleDeg = numeric.rad2deg(angleRad);

    rotatedData.forEach(row => {
        if (row['Theta [deg]'] === angleDeg) {
            const rEThetaVal = row['rETheta [V]'];
            const rEPhiVal = row['rEPhi [V]'];

            const rotationMatrix = [
                [numeric.cos(angleRad), -numeric.sin(angleRad)],
                [numeric.sin(angleRad), numeric.cos(angleRad)]
            ];

            const rotatedComponents = numeric.dot(rotationMatrix, [rEThetaVal, rEPhiVal]);

            row['rETheta [V]'] = rotatedComponents[0];
            row['rEPhi [V]'] = rotatedComponents[1];
            row['rETotal [V]'] = numeric.sqrt(numeric.add(numeric.pow(numeric.abs(row['rETheta [V]']), 2), numeric.pow(numeric.abs(row['rEPhi [V]']), 2)));
        }
    });

    return rotatedData;
}

function computeAF(theta, phi, array, k = 2 * Math.PI / 300, theta0 = 0, phi0 = 0, centralize = true, initialPhase = null, normalize = false) {
    const thetaRad = numeric.mul(theta, Math.PI / 180);
    const phiRad = numeric.mul(phi, Math.PI / 180);
    const theta0Rad = theta0 * Math.PI / 180;
    const phi0Rad = phi0 * Math.PI / 180;

    const scanVector = [Math.sin(theta0Rad) * Math.cos(phi0Rad), Math.sin(theta0Rad) * Math.sin(phi0Rad), Math.cos(theta0Rad)];

    if (centralize) {
        const mean = numeric.div(numeric.sum(array, 0), array.length);
        array = numeric.sub(array, mean);
    }

    const obsVectors = [];
    for (let i = 0; i < thetaRad.length; i++) {
        obsVectors.push([
            Math.sin(thetaRad[i]) * Math.cos(phiRad[i]),
            Math.sin(thetaRad[i]) * Math.sin(phiRad[i]),
            Math.cos(thetaRad[i])
        ]);
    }

    const diffs = numeric.sub(obsVectors, scanVector);

    let phases;
    if (initialPhase === null) {
        phases = numeric.mul(k, numeric.dot(diffs, numeric.transpose(array)));
    } else {
        const initialPhaseRad = numeric.mul(initialPhase, Math.PI / 180);
        phases = numeric.add(numeric.mul(k, numeric.dot(diffs, numeric.transpose(array))), initialPhaseRad);
    }

    const AF = numeric.sum(numeric.exp(numeric.mul(numeric.complex(0, 1), phases)), 1);

    return normalize ? numeric.div(AF, array.length) : AF;
}

async function computeAFAndField(station, phiAngle, updateProgress) {
    const data = await readTable('data/rE_table_vivaldi.csv');
    const theta = data.map(row => row['Theta [deg]']);
    const phi = data.map(row => row['Phi [deg]']);

    const uniqueTheta = [...new Set(theta)];
    const uniquePhi = [...new Set(phi)];

    const k = 2 * Math.PI / 300;
    const theta0 = 0;
    const phi0 = 0;

    // Cria uma chave única para os inputs da função compute_AF
    const inputKey = JSON.stringify({ station, theta: uniqueTheta, phi: uniquePhi, k, theta0, phi0 });

    // Verifica se o resultado já está no cache
    if (computeAFCache[inputKey]) {
        console.log("Usando resultado do cache...");
        return computeAFCache[inputKey];
    }

    // Rotaciona os campos para cada tile na estação
    const rotatedFields = [];
    let progress = 0;
    const totalTiles = station.length;
    const tile_array_centered = tile_array.map(point => [
        point[0] - tile_array.reduce((sum, p) => sum + p[0], 0) / tile_array.length,
        point[1] - tile_array.reduce((sum, p) => sum + p[1], 0) / tile_array.length
    ]);
    for (let i = 0; i < totalTiles; i++) {
        const tile_center = station[i][0];
        const tile_angle = station[i][1];

        const rotated_tile = rotatePoints(tile_array_centered, tile_angle);
        const translated_tile = rotated_tile.map(point => [point[0] + tile_center[0], point[1] + tile_center[1]]);

        rotatedFields.push(rotateField(data, tile_angle));

        progress = Math.round(((i + 1) / totalTiles) * 50); // Metade do progresso total
        updateProgress(progress);
    }

    // Calcula o AF
    const af = computeAF(uniqueTheta, uniquePhi, station, k, theta0, phi0);

    // Aplica o AF no campo
    const applied_field = applyAFOnField(data, af, rotatedFields, uniqueTheta, uniquePhi);

    // Calcula o SLL
    const sll = calculateSLL(uniqueTheta, af, phiAngle);

    // Filtra os valores de theta para o ângulo phi fornecido
    const thetaValues = [];
    for (let i = 0; i < theta.length; i++) {
        if (phi[i] === phiAngle) {
            thetaValues.push(theta[i]);
        }
    }

    // Armazena o resultado no cache
    const result = { af, thetaValues, applied_field, sll };
    computeAFCache[inputKey] = result;

    // Salva o cache atualizado no localStorage
    saveCache();

    updateProgress(100); // Progresso completo
    return result;
}

function applyAFOnField(field, af, rotatedFields, theta, phi) {
    const out_field = [];
    const uniqueTheta = [...new Set(theta)]; // Garante que os valores de Theta sejam únicos

    for (let i = 0; i < uniqueTheta.length; i++) {
        for (let j = 0; j < phi.length; j++) {
            const out_row = {
                'Theta [deg]': uniqueTheta[i],
                'Phi [deg]': phi[j],
                'rETheta [V]': numeric.complex(0, 0),
                'rEPhi [V]': numeric.complex(0, 0)
            };

            // Soma os campos rotacionados, multiplicados pelo AF
            rotatedFields.forEach((rotated_field, index) => {
                const field_row = rotated_field.find(row => row['Theta [deg]'] === uniqueTheta[i] && row['Phi [deg]'] === phi[j]);
                if (field_row) {
                    const af_value = af[i];
                    out_row['rETheta [V]'] = numeric.add(out_row['rETheta [V]'], numeric.mul(field_row['rETheta [V]'], af_value));
                    out_row['rEPhi [V]'] = numeric.add(out_row['rEPhi [V]'], numeric.mul(field_row['rEPhi [V]'], af_value));
                }
            });

            // Calcula a magnitude total do campo elétrico
            out_row['rETotal [V]'] = numeric.sqrt(numeric.add(numeric.pow(numeric.abs(out_row['rETheta [V]']), 2), numeric.pow(numeric.abs(out_row['rEPhi [V]']), 2)));
            out_field.push(out_row);
        }
    }
    return out_field;
}

function displayFieldPlot(af, thetaValues, stationName, phiAngle) {
    const fieldPlotContainer = document.getElementById('field-plot-container');
    fieldPlotContainer.innerHTML = ''; // Limpa o conteúdo anterior

    const afValues = af.map(value => numeric.abs(value));

    const plotData = [{
        x: thetaValues,
        y: afValues,
        mode: 'lines',
        type: 'scatter'
    }];

    const layout = {
        title: `${stationName} - Campo Elétrico (Phi = ${phiAngle}°)`,
        xaxis: {
            title: 'Theta (deg)',
            range: [-90, 90]
        },
        yaxis: {
            title: 'Magnitude do Campo Elétrico (V)'
        },
        autosize: true
    };

    Plotly.newPlot(fieldPlotContainer, plotData, layout);
}
function calculateSLL(theta, af, phiAngle) {
    const afFiltered = [];
    const thetaFiltered = [];

    for (let i = 0; i < theta.length; i++) {
        if (phiAngle === 90 && theta[i] >= -90 && theta[i] <= 90) {
            afFiltered.push(numeric.abs(af[i]));
            thetaFiltered.push(theta[i]);
        }
    }

    let mainPeakIndexFiltered = 0;
    for (let i = 0; i < thetaFiltered.length; i++) {
        if (thetaFiltered[i] === 0) {
            mainPeakIndexFiltered = i;
            break;
        }
    }

    const mainPeakValue = afFiltered[mainPeakIndexFiltered];
    const peaks = [];

    for (let i = 1; i < afFiltered.length - 1; i++) {
        if (afFiltered[i] > afFiltered[i - 1] && afFiltered[i] > afFiltered[i + 1] && i !== mainPeakIndexFiltered) {
            peaks.push(afFiltered[i]);
        }
    }

    peaks.sort((a, b) => b - a);

    const sll = peaks.length > 0 ? peaks[0] / mainPeakValue : 0;
    return isFinite(sll) ? 20 * Math.log10(sll) : -Infinity;
}

function displaySLL(sll, af, theta) {
    const sllContainer = document.getElementById('sll-container');
    const sllValueSpan = document.getElementById('sll-value');
    sllContainer.style.display = 'block';
    sllValueSpan.innerText = `${sll.toFixed(2)} dB`;

    // Normaliza o SLL para o intervalo de 0 a 1
    const normalizedSLL = Math.max(0, Math.min(1, (sll + 30) / 30));

    // Interpola entre vermelho (ruim) e verde (bom) com base no valor do SLL
    const red = Math.round(255 * normalizedSLL);
    const green = Math.round(255 * (1 - normalizedSLL));
    const blue = 0;

    // Define a cor de fundo do contêiner SLL
    sllContainer.style.backgroundColor = `rgb(${red},${green},${blue})`;
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