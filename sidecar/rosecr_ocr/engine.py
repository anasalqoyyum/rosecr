from importlib.metadata import version
from pathlib import Path

import numpy as np
import rapidocr
from rapidocr import LangRec, ModelType, OCRVersion, RapidOCR

from .layout import Detection

DETECTION_MODEL = 'PP-OCRv6_det_small.onnx'
RECOGNITION_MODEL = 'PP-OCRv6_rec_small.onnx'
# Detection runs on the image scaled so its longest side is at most this many pixels.
DETECTION_MAX_SIDE = 960
INFERENCE_THREADS = 4


class RapidOcrEngine:
    """PP-OCRv6 small through RapidOCR. The multilingual 'japan' recognizer also reads
    English, so one engine serves both translation directions.

    Model paths are explicit so a missing model fails startup instead of triggering
    RapidOCR's network download.
    """

    name = 'rapidocr'

    def __init__(self, model_dir: Path | None = None):
        models = model_dir or Path(rapidocr.__file__).parent / 'models'
        for model in (DETECTION_MODEL, RECOGNITION_MODEL):
            if not (models / model).is_file():
                raise FileNotFoundError(f'OCR model {model} is missing.')
        self.version = version('rapidocr')
        self._model = RapidOCR(params={
            'Global.log_level': 'error',
            'Global.use_cls': False,
            'Det.ocr_version': OCRVersion.PPOCRV6,
            'Det.model_type': ModelType.SMALL,
            # LangDet has no Japanese member, but PP-OCRv6 resolves its detector by this string.
            'Det.lang_type': LangRec.JAPAN.value,
            'Det.model_path': str(models / DETECTION_MODEL),
            'Det.limit_type': 'max',
            'Det.limit_side_len': DETECTION_MAX_SIDE,
            'Rec.ocr_version': OCRVersion.PPOCRV6,
            'Rec.model_type': ModelType.SMALL,
            'Rec.lang_type': LangRec.JAPAN,
            'Rec.model_path': str(models / RECOGNITION_MODEL),
            'EngineConfig.onnxruntime.intra_op_num_threads': INFERENCE_THREADS,
        })

    def warm_up(self) -> None:
        self.recognize(np.zeros((64, 256, 3), dtype=np.uint8))

    def recognize(self, bgr: np.ndarray) -> list[Detection]:
        output = self._model(bgr)
        if output.boxes is None or output.txts is None or output.scores is None:
            return []
        return [
            Detection([(float(x), float(y)) for x, y in quad], text, float(score))
            for quad, text, score in zip(output.boxes, output.txts, output.scores)
        ]
