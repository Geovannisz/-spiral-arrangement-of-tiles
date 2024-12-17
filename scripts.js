// ==================== Parâmetros do Tile ====================
const dx = 176.0695885;
const dy = 167.5843071;
const N = 2;
const M = 8;

// ==================== Funções Primárias ====================

async function readTable(file) {
    const response = await fetch(file);
    const text = await response.text();
    const rows = text.trim().split('\n').slice(1);
    const headers = rows[0].split(',');
    const data = {};

    headers.forEach(header => {
        data[header.trim()] = [];
    });

    rows.slice(1).forEach(row => {
        const values = row.split(',');
        headers.forEach((header, index) => {
            data[header.trim()].push(parseFloat(values[index]));
        });
    });

    for (const col in data) {
        if (col.endsWith('[mV]')) {
            const newCol = col.replace('[mV]', '[V]');
            data[newCol] = data[col].map(val => val * 1e-3);
            delete data[col];
        }
    }

    data['rETheta [V]'] = numeric.add(data['re(rETheta) [V]'], numeric.mul(numeric.complex(0, 1), data['im(rETheta) [V]']));
    data['rEPhi [V]'] = numeric.add(data['re(rEPhi) [V]'], numeric.mul(numeric.complex(0, 1), data['im(rEPhi) [V]']));

    ['re(rETheta) [V]', 'im(rETheta) [V]', 're(rEPhi) [V]', 'im(rEPhi) [V]'].forEach(col => delete data[col]);

    data['rETotal [V]'] = data['rETheta [V]'].map((val, i) => {
        return Math.sqrt(Math.pow(numeric.abs(val), 2) + Math.pow(numeric.abs(data['rEPhi [V]'][i]), 2));
    });

    return data;
}

function computeAF(theta, phi, array, k = 2 * Math.PI / 300, theta0 = 0, phi0 = 0, centralize = true, initialPhase = null, normalize = false) {
    const thetaRad = theta.map(val => numeric.deg2rad(val));
    const phiRad = phi.map(val => numeric.deg2rad(val));
    const theta0Rad = numeric.deg2rad(theta0);
    const phi0Rad = numeric.deg2rad(phi0);

    const scanVector = [Math.sin(theta0Rad) * Math.cos(phi0Rad), Math.sin(theta0Rad) * Math.sin(phi0Rad), Math.cos(theta0Rad)];

    if (centralize) {
        const mean = numeric.div(array.reduce((sum, p) => numeric.add(sum, p), [0, 0, 0]), array.length);
        array = array.map(p => numeric.sub(p, mean));
    }

    const obsVectors = numeric.transpose([
        numeric.mul(numeric.sin(thetaRad), numeric.cos(phiRad)),
        numeric.mul(numeric.sin(thetaRad), numeric.sin(phiRad)),
        numeric.cos(thetaRad)
    ]);

    const diffs = numeric.sub(obsVectors, scanVector);

    let AF;
    if (initialPhase === null) {
        const phases = numeric.dot(numeric.mul(k, diffs), numeric.transpose(array));
        AF = numeric.sum(numeric.exp(numeric.mul(numeric.complex(0, 1), phases)), 1);
    } else {
        const initialPhaseRad = initialPhase.map(val => numeric.deg2rad(val));
        const phases = numeric.add(numeric.dot(numeric.mul(k, diffs), numeric.transpose(array)), initialPhaseRad);
        AF = numeric.sum(numeric.exp(numeric.mul(numeric.complex(0, 1), phases)), 1);
    }

    return normalize ? numeric.div(AF, array.length) : AF;
}

// ==================== Funções Secundárias ====================

function createPlanarArray(dx = 0, dy = 0, N = 1, M = 1) {
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
    return numeric.dot(points, numeric.transpose(R));
}

function rotateField(data, angleRad) {
    const rotatedData = JSON.parse(JSON.stringify(data)); // Cria uma cópia profunda
    const angleDeg = numeric.rad2deg(angleRad);

    const thetaIndices = [];
    for (let i = 0; i < data['Theta [deg]'].length; i++) {
        if (data['Theta [deg]'][i] === angleDeg) {
            thetaIndices.push(i);
        }
    }

    if (thetaIndices.length > 0) {
        const rEThetaVals = thetaIndices.map(i => data['rETheta [V]'][i]);
        const rEPhiVals = thetaIndices.map(i => data['rEPhi [V]'][i]);

        const rotationMatrix = [
            [Math.cos(angleRad), -Math.sin(angleRad)],
            [Math.sin(angleRad), Math.cos(angleRad)]
        ];

        const rotatedComponents = numeric.dot(rotationMatrix, [rEThetaVals, rEPhiVals]);

        thetaIndices.forEach((index, i) => {
            rotatedData['rETheta [V]'][index] = rotatedComponents[0][i];
            rotatedData['rEPhi [V]'][index] = rotatedComponents[1][i];
        });

        rotatedData['rETotal [V]'] = rotatedData['rETheta [V]'].map((val, i) => {
            return Math.sqrt(Math.pow(numeric.abs(val), 2) + Math.pow(numeric.abs(rotatedData['rEPhi [V]'][i]), 2));
        });
    }

    return rotatedData;
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

// ==================== Funções Auxiliares ====================

function db(dataframe) {
    return numeric.mul(20, numeric.log10(dataframe));
}

function calculateSLL(theta, af) {
    // Encontrar o índice do pico principal (mais próximo de 0 em theta)
    const mainPeakIndex = theta.reduce((minIdx, val, idx, arr) => Math.abs(arr[minIdx]) < Math.abs(val) ? minIdx : idx, 0);
    const mainPeakValue = af[mainPeakIndex];

    // Encontrar picos, excluindo o pico principal
    const peaks = [];
    for (let i = 1; i < af.length - 1; i++) {
        if (af[i] > af[i - 1] && af[i] > af[i + 1] && i !== mainPeakIndex) {
            peaks.push(af[i]);
        }
    }

    // Ordenar os picos em ordem decrescente
    peaks.sort((a, b) => b - a);

    // Calcular o SLL
    const sll = peaks.length > 0 ? peaks[0] / mainPeakValue : 0;

    // Retornar o SLL em dB
    return 20 * Math.log10(sll);
}

// ==================== Geração de Arranjo de Tiles ====================

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

// ==================== Funções do Site ====================

let dataCache = {};

async function loadData() {
    const dataFiles = [
        './data/rE_table_vivaldi.csv',
        './data/rE_table_vivaldi_1.5GHz.csv',
        './data/rE_table_vivaldi_1.4GHz.csv',
        './data/rE_table_vivaldi_1.3GHz.csv',
        './data/rE_table_vivaldi_1.2GHz.csv',
        './data/rE_table_vivaldi_1.1GHz.csv',
        './data/rE_table_vivaldi_0.9GHz.csv',
        './data/rE_table_vivaldi_0.8GHz.csv',
        './data/rE_table_vivaldi_0.7GHz.csv',
        './data/rE_table_vivaldi_0.6GHz.csv',
        './data/rE_table_vivaldi_0.5GHz.csv'
    ];

    for (const file of dataFiles) {
        if (!dataCache[file]) {
            dataCache[file] = await readTable(file);
        }
    }
}

function generatePlot() {
    // Carrega os dados antes de gerar o gráfico
    loadData().then(() => {
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
    });
}

// ==================== Display do Gráfico e Mensagens ====================

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

// ==================== Cópia de Código ====================

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

// ==================== Cálculo e Display do SLL ====================

async function calculateAndDisplaySLL() {
    const stationName = document.getElementById('station_name').value;
    const phiAngle = parseFloat(document.getElementById('phi_angle').value);

    // Verifica se os dados já foram calculados
    if (!results[stationName]) {
        console.error("Dados da estação não encontrados. Gere a station primeiro.");
        return;
    }

    const stationData = results[stationName].station;
    const selectedData = dataCache['./data/rE_table_vivaldi.csv'];

    // Filtra os dados para o ângulo Phi selecionado
    const phiData = selectedData['Phi [deg]'];
    const closestPhiIndex = phiData.reduce((prev, curr, index) => {
        return (Math.abs(curr - phiAngle) < Math.abs(phiData[prev] - phiAngle) ? index : prev);
    }, 0);
    const closestPhi = phiData[closestPhiIndex];

    const theta = selectedData['Theta [deg]'];
    const af = computeAF(theta, Array(theta.length).fill(closestPhi), stationData);
    const afFiltered = numeric.abs(af);

    const sllValue = calculateSLL(theta, afFiltered);
    displaySLL(sllValue);
}

function displaySLL(sllValue) {
    const sllContainer = document.getElementById('sll-container');
    const sllValueSpan = document.getElementById('sll-value');

    sllValueSpan.textContent = `SLL: ${sllValue.toFixed(2)} dB`;

    // Define a cor de fundo com base no valor do SLL
    const greenComponent = Math.round(255 * Math.max(0, (sllValue + 30) / 30)); // -30 dB se torna 0, 0 dB se torna 1
    const redComponent = Math.round(255 * (1 - Math.max(0, (sllValue + 30) / 30))); // Inverte a escala para vermelho
    sllContainer.style.backgroundColor = `rgb(${redComponent}, ${greenComponent}, 0)`;
}

// ==================== Inicialização ====================

// Cria o array do tile
let tile_array = createPlanarArray(dx, dy, N, M);
tile_array = tile_array.map(point => [point[0] - tile_array.reduce((sum, p) => sum + p[0], 0) / tile_array.length, point[1] - tile_array.reduce((sum, p) => sum + p[1], 0) / tile_array.length]);

const tile_size_x = Math.max(...tile_array.map(p => p[0])) - Math.min(...tile_array.map(p => p[0]));
const tile_size_y = Math.max(...tile_array.map(p => p[1])) - Math.min(...tile_array.map(p => p[1]));
const tile_size = Math.sqrt(tile_size_x ** 2 + tile_size_y ** 2);

// ==================== Cache dos Resultados ====================
let results = {};

async function loadCache() {
    try {
        const response = await fetch('./data/compute_af_cache.pkl');
        if (response.ok) {
            const buffer = await response.arrayBuffer();
            results = parsePkl(buffer);
        } else {
            console.error('Falha ao carregar o cache.');
        }
    } catch (error) {
        console.error('Erro ao carregar o cache:', error);
    }
}

function parsePkl(buffer) {
    // Substitua esta função pela implementação correta do parser de PKL em JavaScript
    // Como não há uma biblioteca padrão para isso, você precisará de uma implementação customizada
    console.warn('A função parsePkl precisa ser implementada para ler arquivos PKL em JavaScript.');
    return {};
}

// Carrega o cache ao iniciar
loadCache();

// ==================== Inicialização ====================

// Chama a função loadData para pré-carregar os dados quando a página carrega
loadData();

// ==================== Event Listeners ====================

// Adiciona um event listener para o botão de calcular SLL
document.getElementById('calculate-sll-button').addEventListener('click', calculateAndDisplaySLL);