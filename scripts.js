// ==================== Parâmetros do Tile ====================
const dx = 176.0695885;
const dy = 167.5843071;
const N = 2;
const M = 8;

// ==================== Caminhos para os Arquivos de Dados ====================
const dataFiles = {
    'default': './data/rE_table_vivaldi.csv',
    '1500M': './data/rE_table_vivaldi_1.5GHz.csv',
    '1400M': './data/rE_table_vivaldi_1.4GHz.csv',
    '1300M': './data/rE_table_vivaldi_1.3GHz.csv',
    '1200M': './data/rE_table_vivaldi_1.2GHz.csv',
    '1100M': './data/rE_table_vivaldi_1.1GHz.csv',
    '900M': './data/rE_table_vivaldi_0.9GHz.csv',
    '800M': './data/rE_table_vivaldi_0.8GHz.csv',
    '700M': './data/rE_table_vivaldi_0.7GHz.csv',
    '600M': './data/rE_table_vivaldi_0.6GHz.csv',
    '500M': './data/rE_table_vivaldi_0.5GHz.csv'
};

// ==================== Dados de Campo Elétrico ====================
let electricFieldData = {};

// Função para carregar os dados de campo elétrico
async function loadElectricFieldData() {
    for (const [key, path] of Object.entries(dataFiles)) {
        electricFieldData[key] = await readTable(path);
    }
}

// Carrega os dados de campo elétrico quando a página carrega
window.addEventListener('DOMContentLoaded', (event) => {
    loadElectricFieldData();
});

// ==================== Cache para compute_AF ====================
let computeAFCache = {};

// Função para carregar o cache do localStorage
function loadCache() {
    const cachedData = localStorage.getItem('computeAFCache');
    if (cachedData) {
        computeAFCache = JSON.parse(cachedData);
    }
}

// Função para salvar o cache no localStorage
function saveCache() {
    localStorage.setItem('computeAFCache', JSON.stringify(computeAFCache));
}

// Carrega o cache quando a página carrega
loadCache();

// ==================== Funções Primárias ====================

async function readTable(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            download: true,
            header: true,
            dynamicTyping: true,
            complete: function(results) {
                const data = results.data;

                // Converte colunas de milivolts para volts e remove as colunas originais
                for (const col of ['re(rETheta)', 'im(rETheta)', 're(rEPhi)', 'im(rEPhi)']) {
                    if (`${col} [mV]` in data[0]) {
                        data.forEach(row => {
                            row[`${col} [V]`] = row[`${col} [mV]`] * 1e-3;
                            delete row[`${col} [mV]`];
                        });
                    }
                }

                // Calcula os componentes complexos do campo elétrico
                data.forEach(row => {
                    row['rETheta [V]'] = math.complex(row['re(rETheta) [V]'], row['im(rETheta) [V]']);
                    row['rEPhi [V]'] = math.complex(row['re(rEPhi) [V]'], row['im(rEPhi) [V]']);
                });

                // Remove colunas intermediárias
                for (const col of ['re(rETheta) [V]', 'im(rETheta) [V]', 're(rEPhi) [V]', 'im(rEPhi) [V]']) {
                    if (col in data[0]) {
                        data.forEach(row => {
                            delete row[col];
                        });
                    }
                }

                // Calcula a magnitude total do campo elétrico
                data.forEach(row => {
                    row['rETotal [V]'] = math.sqrt(math.add(math.square(math.abs(row['rETheta [V]'])), math.square(math.abs(row['rEPhi [V]']))));
                });

                resolve(data);
            },
            error: function(error) {
                reject(error);
            }
        });
    });
}

function compute_AF(theta, phi, array, k = 2 * Math.PI / 300, theta_0 = 0, phi_0 = 0, centralize = true, initial_phase = null, normalize = false) {
    // Cria uma chave única para os inputs
    const inputKey = JSON.stringify([theta, phi, array, k, theta_0, phi_0, centralize, initial_phase, normalize]);

    // Verifica se o resultado já está no cache
    if (computeAFCache[inputKey]) {
        return computeAFCache[inputKey];
    }

    // Converte ângulos para radianos
    const theta_rad = theta.map(val => math.unit(val, 'deg').toNumber('rad'));
    const phi_rad = phi.map(val => math.unit(val, 'deg').toNumber('rad'));
    const theta_0_rad = math.unit(theta_0, 'deg').toNumber('rad');
    const phi_0_rad = math.unit(phi_0, 'deg').toNumber('rad');

    // Vetor de varredura
    const scan_vector = [math.sin(theta_0_rad) * math.cos(phi_0_rad), math.sin(theta_0_rad) * math.sin(phi_0_rad), math.cos(theta_0_rad)];

    // Centraliza o array
    let array_copy = [...array];
    if (centralize) {
        const mean = math.mean(array_copy, 0);
        array_copy = array_copy.map(point => math.subtract(point, mean));
    }

    // Pré-calcula os vetores de observação
    const obs_vectors = theta_rad.map((t, i) => [math.sin(t) * math.cos(phi_rad[i]), math.sin(t) * math.sin(phi_rad[i]), math.cos(t)]);

    // Calcula a diferença entre os vetores de observação e o vetor de varredura
    const diffs = obs_vectors.map(obs => math.subtract(obs, scan_vector));

    // Calcula o AF
    let AF = [];
    if (initial_phase === null) {
        diffs.forEach(diff => {
            const phase = math.multiply(k, math.dot(diff, math.transpose(array_copy)));
            let sum = math.complex(0, 0);
            for (let i = 0; i < phase.length; i++) {
                sum = math.add(sum, math.exp(math.multiply(math.complex(0, 1), phase[i])));
            }
            AF.push(sum);
        });
    } else {
        const initial_phase_rad = initial_phase.map(val => math.unit(val, 'deg').toNumber('rad'));
        diffs.forEach((diff, index) => {
            const phase = math.add(math.multiply(k, math.dot(diff, math.transpose(array_copy))), initial_phase_rad);
            let sum = math.complex(0, 0);
            for (let i = 0; i < phase.length; i++) {
                sum = math.add(sum, math.exp(math.multiply(math.complex(0, 1), phase[i])));
            }
            AF.push(sum);
        });
    }

    // Armazena o resultado no cache
    computeAFCache[inputKey] = AF;
    saveCache(); // Salva o cache atualizado

    return normalize ? AF.map(val => math.divide(val, array_copy.length)) : AF;
}

// ==================== Funções Secundárias ====================

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

function rotateField(data, angle_rad) {
    // Cria uma cópia do DataFrame para evitar modificar o original
    let rotated_data = JSON.parse(JSON.stringify(data));

    // Converte o ângulo de radianos para graus
    const angle_deg = angle_rad * 180 / Math.PI;

    // Encontra os índices correspondentes aos ângulos de rotação desejados
    let theta_indices = [];
    for (let i = 0; i < data.length; i++) {
        if (data[i]['Theta [deg]'] === angle_deg) {
            theta_indices.push(i);
        }
    }

    if (theta_indices.length > 0) {
        // Obtém os valores de rETheta e rEPhi para os ângulos encontrados
        let rETheta_vals = theta_indices.map(i => data[i]['rETheta [V]']);
        let rEPhi_vals = theta_indices.map(i => data[i]['rEPhi [V]']);

        // Rotaciona os componentes do campo
        const rotation_matrix = [
            [Math.cos(angle_rad), -Math.sin(angle_rad)],
            [Math.sin(angle_rad),  Math.cos(angle_rad)]
        ];

        let rotated_components = math.multiply(rotation_matrix, [rETheta_vals, rEPhi_vals]);

        // Atualiza os valores de rETheta e rEPhi no DataFrame rotacionado
        theta_indices.forEach((index, i) => {
            rotated_data[index]['rETheta [V]'] = rotated_components[0][i];
            rotated_data[index]['rEPhi [V]'] = rotated_components[1][i];
        });

        // Recalcula rETotal
        rotated_data.forEach(row => {
            row['rETotal [V]'] = math.sqrt(math.add(math.square(math.abs(row['rETheta [V]'])), math.square(math.abs(row['rEPhi [V]']))));
        });
    }

    return rotated_data;
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

function createStationArray(tiles_config, tile_array, data) {
    const array_tot = [];
    const rotated_fields = [];
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

            const rotated_field = rotateField(data, tile_angle);
            rotated_fields.push(rotated_field);
        } else {
            collision_messages.push(`Colisão detectada no tile ${i + 1}. Coordenadas do centro: (${collisionInfo.tileCenter[0].toFixed(2)}, ${collisionInfo.tileCenter[1].toFixed(2)}). Posição ignorada.`);
        }
    }

    return [array_tot, rotated_fields, collision_messages];
}

// ==================== Funções Auxiliares ====================
function apply_AF_on_field(field, AF, rotated_fields) {
    let out_field = JSON.parse(JSON.stringify(field)); // Copia o array original
    out_field.forEach(row => {
        row['rETheta [V]'] = math.complex(0,0);
        row['rEPhi [V]'] = math.complex(0,0);
    });

    // Soma os campos rotacionados, multiplicados pelo AF
    for (let i = 0; i < rotated_fields.length; i++) {
        const rotated_field = rotated_fields[i];
        for (let j = 0; j < rotated_field.length; j++) {
            const af_value = AF[j];
            out_field[j]['rETheta [V]'] = math.add(out_field[j]['rETheta [V]'], math.multiply(rotated_field[j]['rETheta [V]'], af_value));
            out_field[j]['rEPhi [V]'] = math.add(out_field[j]['rEPhi [V]'], math.multiply(rotated_field[j]['rEPhi [V]'], af_value));
        }
    }
    
    // Calcula a magnitude total do campo elétrico
    out_field.forEach(row => {
        row['rETotal [V]'] = math.sqrt(math.add(math.square(math.abs(row['rETheta [V]'])), math.square(math.abs(row['rEPhi [V]']))));
    });
    
    return out_field;
}

function db(dataframe) {
    return dataframe.map(value => 20 * Math.log10(math.abs(value)));
}

function calculate_sll(theta, af) {
    // Encontrar o índice do valor mais próximo de 0 em theta
    const main_peak_index = theta.findIndex(angle => Math.abs(angle) === Math.min(...theta.map(Math.abs)));

    // Obter o valor do pico principal
    const main_peak_value = af[main_peak_index];

    // Encontrar os picos, excluindo o pico principal
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

// ==================== Geração do Arranjo e Gráficos ====================

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

    const [station, rotated_fields, collisionMessages] = createStationArray(tileArrangement, tile_array, electricFieldData['default']);

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

// ==================== Geração do Gráfico de Campo Elétrico ====================
async function generateAFPlot() {
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
    const phiAngle = parseFloat(document.getElementById('phi_angle').value);

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

    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const totalTiles = tileArrangement.length;
    let processedTiles = 0;

    progressBar.style.width = '0%';
    progressText.textContent = '0%';

    // Inicializa um array para armazenar os campos rotacionados de cada tile
    let allRotatedFields = [];

    for (const tileConfig of tileArrangement) {
        const [station, rotated_fields, collisionMessages] = createStationArray([tileConfig], tile_array, electricFieldData['default']);
        allRotatedFields.push(...rotated_fields);

        processedTiles++;
        const progress = (processedTiles / totalTiles) * 100;
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `${progress.toFixed(0)}%`;
    }
    
    // Filtra os dados para o ângulo phi especificado
    const filteredData = electricFieldData['default'].filter(row => row['Phi [deg]'] === phiAngle);
    
    // Calcula o AF para os dados filtrados
    const theta = filteredData.map(row => row['Theta [deg]']);
    const phi = filteredData.map(row => row['Phi [deg]']);

    // Recalcula a estação usando todos os tiles do arranjo
    const [station, rotated_fields, collisionMessages] = createStationArray(tileArrangement, tile_array, electricFieldData['default']);

    // Calcula o AF
    const AF = compute_AF(theta, phi, station);

    // Aplica o AF no campo
    const appliedField = apply_AF_on_field(filteredData, AF, allRotatedFields);

    // Calcula o SLL
    const sllValue = calculate_sll(theta, AF.map(val => math.abs(val)));

    // Atualiza o valor do SLL na interface
    const sllElement = document.getElementById('sll-value');
    sllElement.textContent = `${sllValue.toFixed(2)} dB`;

    // Formatação condicional do SLL
    const sllContainer = document.getElementById('sll-container');
    const sllPercentage = (sllValue + 30) / 30; // Normaliza entre 0 e 1
    const red = Math.round(255 * sllPercentage);
    const green = Math.round(255 * (1 - sllPercentage));
    sllContainer.style.backgroundColor = `rgb(${red}, ${green}, 0)`;

    // Plota o gráfico
    const xValues = appliedField.map(row => row['Theta [deg]']);
    const yValues = appliedField.map(row => row['rETotal [V]']);

    const plotData = [{
        x: xValues,
        y: db(yValues),
        mode: 'lines',
        type: 'scatter'
    }];

    const layout = {
        title: `Campo Elétrico Aplicado - ${stationName} (Phi = ${phiAngle}°)`,
        xaxis: {
            title: 'Theta (deg)',
            range: [-90, 90]
        },
        yaxis: {
            title: 'rETotal (dBV)'
        },
        autosize: true
    };

    Plotly.newPlot('af-plot', plotData, layout);
}