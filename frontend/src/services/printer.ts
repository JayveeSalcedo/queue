import { Ticket } from '../types';

export class ThermalPrinterService {
  private device: any = null;
  private characteristic: any = null;
  private connectedDeviceName: string | null = null;

  public isWebBluetoothAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  public getConnectedDeviceName(): string | null {
    return this.connectedDeviceName;
  }

  public isConnected(): boolean {
    return !!this.characteristic;
  }

  /**
   * Request pairing with a Bluetooth ESC/POS receipt printer
   */
  public async connectBluetooth(): Promise<boolean> {
    if (!this.isWebBluetoothAvailable()) {
      throw new Error('Web Bluetooth is not supported on this browser or platform.');
    }

    try {
      const bluetooth = (navigator as any).bluetooth;
      this.device = await bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS service
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC
          '0000ffe0-0000-1000-8000-00805f9b34fb', // Common BLE Serial
          0xffe0,
          0x18f0
        ]
      });

      if (!this.device || !this.device.gatt) {
        throw new Error('Could not access Bluetooth GATT server.');
      }

      const server = await this.device.gatt.connect();
      const services = await server.getPrimaryServices();

      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            this.characteristic = char;
            this.connectedDeviceName = this.device.name || 'Thermal Printer';
            return true;
          }
        }
      }

      throw new Error('No writable printer characteristic found on this device.');
    } catch (err: any) {
      this.characteristic = null;
      this.connectedDeviceName = null;
      throw err;
    }
  }

  /**
   * Build binary ESC/POS command buffer for 58mm paper
   */
  public buildEscPosData(ticket: Ticket): Uint8Array {
    const encoder = new TextEncoder();
    const chunks: Uint8Array[] = [];

    const append = (data: Uint8Array) => chunks.push(data);
    const appendStr = (str: string) => chunks.push(encoder.encode(str));

    // ESC @ -> Initialize printer
    append(new Uint8Array([0x1b, 0x40]));

    // ESC a 1 -> Center align
    append(new Uint8Array([0x1b, 0x61, 0x01]));

    // Header Office Name
    append(new Uint8Array([0x1b, 0x45, 0x01])); // Bold ON
    appendStr(`${ticket.office_name || 'PANELCO III SOUTHEAST AREA OFFICE'}\n`);
    append(new Uint8Array([0x1b, 0x45, 0x00])); // Bold OFF
    appendStr('--------------------------------\n');

    // Queue Type Subtitle
    appendStr(`${ticket.queue_type} QUEUE\n\n`);

    // Huge Queue Number: GS ! 0x22 (double width, double height)
    append(new Uint8Array([0x1d, 0x21, 0x22]));
    append(new Uint8Array([0x1b, 0x45, 0x01])); // Bold ON
    appendStr(` ${ticket.queue_number} \n\n`);

    // Reset font size: GS ! 0x00
    append(new Uint8Array([0x1d, 0x21, 0x00]));
    append(new Uint8Array([0x1b, 0x45, 0x00])); // Bold OFF

    appendStr('--------------------------------\n');
    appendStr('Please wait for your number\nto be called on display.\n\n');

    // Date & Time
    const dateStr = ticket.date_formatted || new Date(ticket.created_at).toLocaleDateString();
    const timeStr = ticket.time_formatted || new Date(ticket.created_at).toLocaleTimeString();
    appendStr(`Date: ${dateStr}  Time: ${timeStr}\n`);
    appendStr('================================\n\n\n\n');

    // Optional Paper Cut: GS V 66 0
    append(new Uint8Array([0x1d, 0x56, 0x42, 0x00]));

    // Combine all chunks into single Uint8Array
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  /**
   * Print ticket via Web Bluetooth if connected
   */
  public async printViaBluetooth(ticket: Ticket): Promise<boolean> {
    if (!this.characteristic) {
      return false;
    }

    try {
      const data = this.buildEscPosData(ticket);
      // Send in 20-512 byte chunks depending on MTU
      const CHUNK_SIZE = 100;
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const slice = data.slice(i, i + CHUNK_SIZE);
        if (this.characteristic.writeValueWithoutResponse) {
          await this.characteristic.writeValueWithoutResponse(slice);
        } else {
          await this.characteristic.writeValue(slice);
        }
      }
      return true;
    } catch (err) {
      console.warn('Bluetooth print failed, characteristic reset:', err);
      this.characteristic = null;
      throw err;
    }
  }

  /**
   * Browser Print Fallback: Opens browser print dialog for 58mm CSS formatted receipt
   */
  public printViaBrowser(ticket: Ticket) {
    const existing = document.getElementById('printable-ticket');
    if (existing) {
      existing.remove();
    }

    const dateStr = ticket.date_formatted || new Date(ticket.created_at).toLocaleDateString();
    const timeStr = ticket.time_formatted || new Date(ticket.created_at).toLocaleTimeString();

    const ticketDiv = document.createElement('div');
    ticketDiv.id = 'printable-ticket';
    ticketDiv.innerHTML = `
      <div style="text-align: center; font-family: monospace; width: 100%; font-size: 13px; line-height: 1.3;">
        <img src="/logo.png" alt="" style="width: 56px; height: 56px; object-fit: contain; display: block; margin: 0 auto 4px;" />
        <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${ticket.office_name || 'PANELCO III SOUTHEAST AREA OFFICE'}</div>
        <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>
        <div style="font-size: 13px; font-weight: bold; letter-spacing: 1px; margin: 4px 0;">${ticket.queue_type} QUEUE</div>
        <div style="font-size: 32px; font-weight: 900; margin: 10px 0; letter-spacing: 2px;">${ticket.queue_number}</div>
        <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>
        <div style="font-size: 11px; margin: 6px 0;">Please wait for your number.<br/>Watch the public display.</div>
        <div style="font-size: 11px; margin-top: 6px;">Date: ${dateStr}</div>
        <div style="font-size: 11px;">Time: ${timeStr}</div>
        <div style="margin-top: 12px; font-size: 10px;">================================</div>
      </div>
    `;

    document.body.appendChild(ticketDiv);
    window.print();
    setTimeout(() => {
      ticketDiv.remove();
    }, 1500);
  }
}

export const thermalPrinterService = new ThermalPrinterService();
