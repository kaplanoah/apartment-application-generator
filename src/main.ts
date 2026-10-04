import './styles.css';
import { saveFile } from './browser/download';
import { createImagePreparer } from './browser/imagePreparer';
import { buildPacketInWorker } from './browser/packetClient';
import { fromLocalDate } from './core/calendar';
import { mountApp } from './ui/app';

const root = document.getElementById('app');
if (root) {
  mountApp(root, fromLocalDate(new Date()), {
    createImagePreparer,
    buildPacket: buildPacketInWorker,
    saveFile,
  });
}
