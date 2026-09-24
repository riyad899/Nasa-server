import { DapMetadata } from "./imerg.interface.js";

const readNumber = (view: DataView, offset: number, type: string): number => {
    if (type === "Float32") return view.getFloat32(offset, false);
    if (type === "Float64") return view.getFloat64(offset, false);
    if (type === "Int32") return view.getInt32(offset, false);
    return view.getInt16(offset, false);
};

const typeSize = (type: string): number => type === "Float64" ? 8 : type === "Float32" || type === "Int32" ? 4 : 2;

export const parseDap2Array = (buffer: ArrayBuffer): number[] => {
    const bytes = new Uint8Array(buffer);
    const marker = new TextDecoder().decode(bytes).indexOf("Data:");
    if (marker < 0) throw new Error("DAP2 response has no data marker");
    let offset = marker + 5;
    while (offset % 4 !== 0) offset += 1;
    if (offset + 4 > buffer.byteLength) throw new Error("DAP2 response has no XDR block");
    const view = new DataView(buffer);
    const blockLength = view.getUint32(offset, false);
    offset += 4;
    if (offset + blockLength > buffer.byteLength) throw new Error("DAP2 XDR block is truncated");
    const values: number[] = [];
    for (let position = offset; position + 4 <= offset + blockLength; position += 4) {
        values.push(view.getFloat32(position, false));
    }
    return values;
};

export const parseDap2Coordinates = (buffer: ArrayBuffer): number[] => {
    const text = new TextDecoder().decode(new Uint8Array(buffer));
    const dataIndex = text.indexOf("Data:");
    if (dataIndex < 0) throw new Error("DAP2 coordinate response has no data marker");
    const header = text.slice(0, dataIndex);
    const match = header.match(/(Float32|Float64|Int32|Int16)\s+\w+\s*\[/);
    if (!match) throw new Error("DAP2 coordinate type is missing");
    const type = match[1];
    let offset = dataIndex + 5;
    while (offset % 4 !== 0) offset += 1;
    const view = new DataView(buffer);
    const blockLength = view.getUint32(offset, false);
    offset += 4;
    const size = typeSize(type);
    const values: number[] = [];
    for (let position = offset; position + size <= offset + blockLength; position += size) {
        values.push(readNumber(view, position, type));
    }
    return values;
};

export const parseDas = (text: string): DapMetadata => {
    const units = text.match(/units\s+"([^"]+)"/i)?.[1];
    const fillValue = text.match(/_FillValue\s+([-+\d.eE]+)/i)?.[1];
    const doi = text.match(/(?:doi|DOI)\s+"([^"]+)"/i)?.[1];
    if (!units || fillValue === undefined) throw new Error("Required IMERG metadata is missing");
    return {
        units,
        fillValue: Number(fillValue),
        doi: doi || "10.5067/GPM/IMERGDF/DAY/07",
    };
};

export const parseDap2Precipitation = (buffer: ArrayBuffer): number[] => {
    const bytes = new Uint8Array(buffer);
    let startOffset = -1;

    for (let i = 0; i < bytes.length - 5; i++) {
        if (
            bytes[i] === 0x44 && // 'D'
            bytes[i + 1] === 0x61 && // 'a'
            bytes[i + 2] === 0x74 && // 't'
            bytes[i + 3] === 0x61 && // 'a'
            bytes[i + 4] === 0x3a    // ':'
        ) {
            let j = i + 5;
            while (j < bytes.length && (bytes[j] === 0x20 || bytes[j] === 0x0d || bytes[j] === 0x0a)) {
                j++;
            }
            startOffset = j;
            break;
        }
    }

    if (startOffset < 0) {
        throw new Error("DAP2 precipitation response has no data marker");
    }

    const view = new DataView(buffer);
    if (startOffset + 4 > buffer.byteLength) {
        throw new Error("DAP2 precipitation response is empty");
    }

    const count = view.getUint32(startOffset, false);
    let dataPos = startOffset + 4;

    if (dataPos + 4 <= buffer.byteLength) {
        const nextUint = view.getUint32(dataPos, false);
        if (nextUint === count) {
            dataPos += 4;
        }
    }

    const values: number[] = [];
    for (let i = 0; i < count && dataPos + 4 <= buffer.byteLength; i++) {
        values.push(view.getFloat32(dataPos, false));
        dataPos += 4;
    }

    if (!values.length) {
        throw new Error("DAP2 precipitation response is empty");
    }
    return values;
};
