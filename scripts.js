// Dados e cache
const dataCache = {};
const computeAfCache = {};

// Carregar dados para a função read_table
async function loadData() {
    const dataFiles = [
        'rE_table_vivaldi.csv', 'rE_table_vivaldi_1.5GHz.csv', 'rE_table_vivaldi_1.4GHz.csv',
        'rE_table_vivaldi_1.3GHz.csv', 'rE_table_vivaldi_1.2GHz.csv', 'rE_table_vivaldi_1.1GHz.csv',
        'rE_table_vivaldi_0.9GHz.csv', 'rE_table_vivaldi_0.8GHz.csv', 'rE_table_vivaldi_0.7GHz.csv',
        'rE_table_vivaldi_0.6GHz.csv', 'rE_table_vivaldi_0.5GHz.csv'
    ];

    for (const file of dataFiles) {
        if (!dataCache[file]) {
            const response = await fetch(`data/${file}`);
            const csvData = await response.text();
            dataCache[file] = csvData;
        }
    }
}

// Função read_table
function readTable(file) {
    const csvData = dataCache[file];
    if (!csvData) {
        console.error(`Arquivo não encontrado no cache: ${file}`);
        return null;
    }

    const lines = csvData.split('\n');
    const headers = lines[0].split(',').map(header => header.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const currentline = lines[i].split(',');
        if (currentline.length === headers.length) {
            const row = {};
            for (let j = 0; j < headers.length; j++) {
                row[headers[j]] = parseFloat(currentline[j]);
            }
            data.push(row);
        }
    }

    const df = {
        'Theta [deg]': data.map(row => row['Theta [deg]']),
        'Phi [deg]': data.map(row => row['Phi [deg]']),
        're(rETheta) [mV]': data.map(row => row['re(rETheta) [mV]']),
        'im(rETheta) [mV]': data.map(row => row['im(rETheta) [mV]']),
        're(rEPhi) [mV]': data.map(row => row['re(rEPhi) [mV]']),
        'im(rEPhi) [mV]': data.map(row => row['im(rEPhi) [mV]'])
    };

    for (const col of ['re(rETheta)', 'im(rETheta)', 're(rEPhi)', 'im(rEPhi)']) {
        if (`${col} [mV]` in df) {
            df[`${col} [V]`] = df[`${col} [mV]`].map(val => val * 1e-3);
            delete df[`${col} [mV]`];
        }
    }

    df['rETheta [V]'] = df['re(rETheta) [V]'].map((re, i) => ({re: re, im: df['im(rETheta) [V]'][i]}));
    df['rEPhi [V]'] = df['re(rEPhi) [V]'].map((re, i) => ({re: re, im: df['im(rEPhi) [V]'][i]}));

    delete df['re(rETheta) [V]'];
    delete df['im(rETheta) [V]'];
    delete df['re(rEPhi) [V]'];
    delete df['im(rEPhi) [V]'];

    df['rETotal [V]'] = df['rETheta [V]'].map((theta, i) => Math.sqrt(
        (theta.re ** 2 + theta.im ** 2) + (df['rEPhi [V]'][i].re ** 2 + df['rEPhi [V]'][i].im ** 2)
    ));

    return df;
}

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

// Função para calcular o Fator de Arranjo (AF)
function computeAF(theta, phi, array, k = 2 * Math.PI / 300, theta_0 = 0, phi_0 = 0, centralize = true, initial_phase = null, normalize = false) {
    // Converte ângulos para radianos
    const theta_rad = theta.map(t => t * Math.PI / 180);
    const phi_rad = phi.map(p => p * Math.PI / 180);
    const theta_0_rad = theta_0 * Math.PI / 180;
    const phi_0_rad = phi_0 * Math.PI / 180;

    // Vetor de varredura
    const scan_vector = [Math.sin(theta_0_rad) * Math.cos(phi_0_rad), Math.sin(theta_0_rad) * Math.sin(phi_0_rad), Math.cos(theta_0_rad)];

    // Centraliza o array
    if (centralize) {
        const mean = array.reduce((acc, val) => acc.map((v, i) => v + val[i]), [0, 0, 0]).map(v => v / array.length);
        array = array.map(point => point.map((v, i) => v - mean[i]));
    }

    // Pré-calcula os vetores de observação
    const obs_vectors = theta_rad.flatMap((t, i) => {
        const p = phi_rad[i];
        return [[Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t)]];
    });

    // Calcula a diferença entre os vetores de observação e o vetor de varredura
    const diffs = obs_vectors.map(obs => obs.map((v, i) => v - scan_vector[i]));

    // Calcula o AF
    let AF;
    if (initial_phase === null) {
        const phases = diffs.map(diff => k * array.reduce((sum, point) => sum + diff.reduce((s, v, i) => s + v * point[i], 0), 0));
        AF = phases.map(phase => ({ re: Math.cos(phase), im: Math.sin(phase) }));
    } else {
        const initial_phase_rad = initial_phase.map(phase => phase * Math.PI / 180);
        const phases = diffs.map((diff, idx) => k * array.reduce((sum, point) => sum + diff.reduce((s, v, i) => s + v * point[i], 0), 0) + initial_phase_rad[idx % initial_phase_rad.length]);
        AF = phases.map(phase => ({ re: Math.cos(phase), im: Math.sin(phase) }));
    }

    // Soma as contribuições de cada elemento do array
    const AF_sum = [];
    for (let i = 0; i < AF.length; i += array.length) {
        let sum = { re: 0, im: 0 };
        for (let j = 0; j < array.length; j++) {
            sum.re += AF[i + j].re;
            sum.im += AF[i + j].im;
        }
        AF_sum.push(sum);
    }

    // Normaliza o AF, se necessário
    const final_AF = normalize ? AF_sum.map(af => ({ re: af.re / array.length, im: af.im / array.length })) : AF_sum;

    return final_AF;
}

// Função para converter coordenadas complexas para magnitude
function complexToMagnitude(data) {
    return data.map(val => Math.sqrt(val.re ** 2 + val.im ** 2));
}

// Função para calcular o SLL
function calculateSLL(theta, af) {
    // Encontra o índice do valor mais próximo de 0 em theta
    const main_peak_index = theta.reduce((prev, curr, index) => Math.abs(curr) < Math.abs(theta[prev]) ? index : prev, 0);

    // Obtém o valor do pico principal
    const main_peak_value = af[main_peak_index];

    // Encontra os picos, excluindo o pico principal
    const peaks = [];
    for (let i = 1; i < af.length - 1; i++) {
        if (af[i] > af[i - 1] && af[i] > af[i + 1] && i !== main_peak_index) {
            peaks.push(af[i]);
        }
    }

    // Ordena os picos em ordem decrescente
    peaks.sort((a, b) => b - a);

    // Verifica se há pelo menos dois picos
    if (peaks.length < 1) {
        console.log("Não foi possível calcular o SLL: Menos de dois picos encontrados.");
        return null;
    }

    // Calcula o SLL
    const sll = peaks[0] / main_peak_value;

    // Retorna o SLL em dB
    return 20 * Math.log10(sll);
}

// Função para calcular e exibir o SLL
function calculateAndDisplaySLL() {
    const phiAngle = parseFloat(document.getElementById('phi_angle').value);
    const stationName = document.getElementById('station_name').value;

    // Carrega os dados e calcula o AF
    loadData().then(() => {
        const data = readTable('rE_table_vivaldi.csv');
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

        // Extrai os ângulos theta e phi dos dados
        const theta = data['Theta [deg]'];
        const phi = data['Phi [deg]'];

        // Encontra o índice correspondente ao ângulo phi selecionado
        const phiIndex = phi.findIndex(p => p === phiAngle);

        // Filtra os ângulos theta com base no phi selecionado
        const filteredTheta = theta.filter((t, i) => phi[i] === phiAngle);

        // Calcula o Fator de Arranjo (AF)
        const inputKey = JSON.stringify({ theta: filteredTheta, phi: phiAngle, station });
        let af;
        if (computeAfCache[inputKey]) {
            af = computeAfCache[inputKey].map(val => ({ re: val.re, im: val.im }));
        } else {
            af = computeAF(filteredTheta, Array(filteredTheta.length).fill(phiAngle), station);
            computeAfCache[inputKey] = af.map(val => ({ re: val.re, im: val.im }));
        }

        // Converte o AF para magnitude
        const afMagnitude = complexToMagnitude(af);

        // Calcula o SLL
        const sll = calculateSLL(filteredTheta, afMagnitude);

        // Exibe o SLL
        const sllValueElement = document.getElementById('sll-value');
        sllValueElement.textContent = sll !== null ? sll.toFixed(2) : 'Não calculado';

        // Atualiza a cor de fundo do elemento SLL
        updateSLLColor(sll);
    });
}

// Função para atualizar a cor de fundo do SLL
function updateSLLColor(sll) {
    const sllValueElement = document.getElementById('sll-value');
    if (sll === null) {
        sllValueElement.style.backgroundColor = '#f8f9fa';
        return;
    }

    // Normaliza o valor do SLL para o intervalo de 0 a 1
    const normalizedSLL = Math.max(0, Math.min(1, (sll + 30) / 30));

    // Calcula a cor com base no valor normalizado do SLL
    const red = Math.floor(255 * normalizedSLL);
    const green = Math.floor(255 * (1 - normalizedSLL));

    // Atualiza a cor de fundo do elemento SLL
    sllValueElement.style.backgroundColor = `rgb(${red}, ${green}, 0)`;
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

// Carrega os dados ao iniciar
loadData();