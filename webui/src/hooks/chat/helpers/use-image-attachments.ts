// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useRef, useState } from "preact/hooks";
import { type ChatImage } from "#webui/chat/sdk/types";
import { attachImages, imageFilesFrom } from "#webui/utils/image-attachments";
import { dragHasFiles } from "#webui/utils/text-file-io";

/** Handlers spread onto the element wrapping the composer's editor. */
export interface ImageZoneProps {
  onPasteCapture: (event: ClipboardEvent) => void;
  onDragEnterCapture: (event: DragEvent) => void;
  onDragOverCapture: (event: DragEvent) => void;
  onDragLeaveCapture: (event: DragEvent) => void;
  onDropCapture: (event: DragEvent) => void;
}

/** The composer's attachments, plus everything that changes them. */
export interface ImageAttachments {
  images: ChatImage[];
  /** Why the last paste/drop/pick left something out, or null. */
  notice: string | null;
  /** True while a file drag is over the editor. */
  dragging: boolean;
  addFiles: (files: File[]) => void;
  removeImage: (index: number) => void;
  clear: () => void;
  zoneProps: ImageZoneProps;
}

/**
 * Attachment state for the chat composer: images pasted, dropped, or picked,
 * and the notice explaining anything rejected. Its drag and paste handlers run
 * in the CAPTURE phase and stop propagation, so the CodeMirror editor
 * underneath never sees the file and can't insert it; a drag or paste carrying
 * no file passes straight through as ordinary text editing.
 * @returns The attachments and their handlers
 */
export function useImageAttachments(): ImageAttachments {
  const [images, setImages] = useState<ChatImage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Reading state is async (FileReader), so the list lives in a ref too: two
  // pastes in quick succession would otherwise both build on the same snapshot
  // and the first one's images would vanish.
  const imagesRef = useRef<ChatImage[]>([]);
  // dragenter/leave fire per child element; a depth counter keeps the overlay
  // from flickering as the pointer crosses the editor's nested nodes.
  const depthRef = useRef(0);

  const publish = useCallback((next: ChatImage[]) => {
    imagesRef.current = next;
    setImages(next);
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      void attachImages(imagesRef.current, files).then((result) => {
        publish(result.images);
        setNotice(result.notice);
      });
    },
    [publish],
  );

  const removeImage = useCallback(
    (index: number) => {
      publish(imagesRef.current.filter((_, i) => i !== index));
      setNotice(null);
    },
    [publish],
  );

  const clear = useCallback(() => {
    publish([]);
    setNotice(null);
  }, [publish]);

  const onPasteCapture = useCallback(
    (event: ClipboardEvent) => {
      const files = imageFilesFrom(event.clipboardData?.files);

      // No image on the clipboard: let the editor paste whatever it is.
      if (files.length === 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      addFiles(files);
    },
    [addFiles],
  );

  const onDropCapture = useCallback(
    (event: DragEvent) => {
      if (!dragHasFiles(event.dataTransfer)) {
        return;
      }

      stopDrag(event);
      depthRef.current = 0;
      setDragging(false);
      // Every dropped file, not just the images: attachImages explains why a
      // non-image was rejected instead of swallowing the drop.
      addFiles([...(event.dataTransfer?.files ?? [])]);
    },
    [addFiles],
  );

  const onDragOverCapture = useCallback((event: DragEvent) => {
    if (dragHasFiles(event.dataTransfer)) {
      stopDrag(event);
    }
  }, []);

  const onDragEnterCapture = useCallback(
    (event: DragEvent) => {
      onDragOverCapture(event);

      if (dragHasFiles(event.dataTransfer)) {
        depthRef.current++;
        setDragging(true);
      }
    },
    [onDragOverCapture],
  );

  const onDragLeaveCapture = useCallback((event: DragEvent) => {
    if (!dragHasFiles(event.dataTransfer)) {
      return;
    }

    depthRef.current = Math.max(0, depthRef.current - 1);
    setDragging(depthRef.current > 0);
  }, []);

  return {
    images,
    notice,
    dragging,
    addFiles,
    removeImage,
    clear,
    zoneProps: {
      onPasteCapture,
      onDragEnterCapture,
      onDragOverCapture,
      onDragLeaveCapture,
      onDropCapture,
    },
  };
}

/**
 * Claim a file drag for this region: preventDefault marks it a valid drop
 * target, stopPropagation keeps the wrapped editor from inserting the file.
 * @param event - The drag event
 */
function stopDrag(event: DragEvent): void {
  event.preventDefault();
  event.stopPropagation();
}
