package main

import (
	"errors"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
	"sort"

	"github.com/astrogo/fitsio"
)

func RenderFITSToPNG(inputPath, outputPath string) error {
	pixels, width, height, err := loadFITSPixels(inputPath)
	if err != nil {
		return err
	}

	img := renderGrayscale(pixels, width, height)

	out, err := os.Create(outputPath)
	if err != nil {
		return err
	}

	if err := png.Encode(out, img); err != nil {
		_ = out.Close()
		return err
	}

	// A failed Close on a written file can mean the PNG was never fully
	// flushed, so the caller must see that rather than a false success.
	return out.Close()
}

func loadFITSPixels(inputPath string) ([]float64, int, int, error) {
	file, err := os.Open(inputPath)
	if err != nil {
		return nil, 0, 0, err
	}
	// Read-only handles: a Close failure cannot lose data, so it is
	// explicitly discarded rather than silently unchecked.
	defer func() { _ = file.Close() }()

	fitsFile, err := fitsio.Open(file)
	if err != nil {
		return nil, 0, 0, err
	}
	defer func() { _ = fitsFile.Close() }()

	for _, hdu := range fitsFile.HDUs() {
		if hdu.Type() != fitsio.IMAGE_HDU {
			continue
		}

		imageHDU, ok := hdu.(fitsio.Image)
		if !ok {
			continue
		}

		axes := imageHDU.Header().Axes()
		if len(axes) < 2 {
			continue
		}

		width := axes[0]
		height := axes[1]
		if width <= 0 || height <= 0 {
			continue
		}

		pixels, err := readImagePixels(imageHDU, width*height)
		if err != nil {
			return nil, 0, 0, err
		}

		return pixels, width, height, nil
	}

	return nil, 0, 0, errors.New("no 2D FITS image HDU found")
}

func readImagePixels(imageHDU fitsio.Image, length int) ([]float64, error) {
	switch imageHDU.Header().Bitpix() {
	case 8:
		buf := make([]uint8, length)
		if err := imageHDU.Read(&buf); err != nil {
			return nil, err
		}
		return toFloat64FromUint8(buf), nil
	case 16:
		buf := make([]int16, length)
		if err := imageHDU.Read(&buf); err != nil {
			return nil, err
		}
		return toFloat64FromInt16(buf), nil
	case 32:
		buf := make([]int32, length)
		if err := imageHDU.Read(&buf); err != nil {
			return nil, err
		}
		return toFloat64FromInt32(buf), nil
	case 64:
		buf := make([]int64, length)
		if err := imageHDU.Read(&buf); err != nil {
			return nil, err
		}
		return toFloat64FromInt64(buf), nil
	case -32:
		buf := make([]float32, length)
		if err := imageHDU.Read(&buf); err != nil {
			return nil, err
		}
		return toFloat64FromFloat32(buf), nil
	case -64:
		buf := make([]float64, length)
		if err := imageHDU.Read(&buf); err != nil {
			return nil, err
		}
		return buf, nil
	default:
		return nil, errors.New("unsupported FITS BITPIX value")
	}
}

func renderGrayscale(pixels []float64, width, height int) image.Image {
	lo, hi := computeClipRange(pixels)
	img := image.NewGray(image.Rect(0, 0, width, height))

	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			index := y*width + x
			value := 0.0
			if index < len(pixels) {
				value = normalizePixel(pixels[index], lo, hi)
			}
			img.SetGray(x, y, color.Gray{Y: uint8(math.Round(value * 255))})
		}
	}

	return img
}

func computeClipRange(pixels []float64) (float64, float64) {
	valid := make([]float64, 0, len(pixels))
	for _, value := range pixels {
		if !math.IsNaN(value) && !math.IsInf(value, 0) {
			valid = append(valid, value)
		}
	}

	if len(valid) == 0 {
		return 0, 1
	}

	sort.Float64s(valid)
	lowIndex := int(float64(len(valid)-1) * 0.01)
	highIndex := int(float64(len(valid)-1) * 0.995)
	low := valid[lowIndex]
	high := valid[highIndex]
	if high <= low {
		high = low + 1
	}

	return low, high
}

func normalizePixel(value, low, high float64) float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}

	clipped := math.Min(math.Max(value, low), high)
	linear := (clipped - low) / (high - low)
	return math.Asinh(linear*8) / math.Asinh(8)
}

func toFloat64FromUint8(input []uint8) []float64 {
	output := make([]float64, len(input))
	for index, value := range input {
		output[index] = float64(value)
	}
	return output
}

func toFloat64FromInt16(input []int16) []float64 {
	output := make([]float64, len(input))
	for index, value := range input {
		output[index] = float64(value)
	}
	return output
}

func toFloat64FromInt32(input []int32) []float64 {
	output := make([]float64, len(input))
	for index, value := range input {
		output[index] = float64(value)
	}
	return output
}

func toFloat64FromInt64(input []int64) []float64 {
	output := make([]float64, len(input))
	for index, value := range input {
		output[index] = float64(value)
	}
	return output
}

func toFloat64FromFloat32(input []float32) []float64 {
	output := make([]float64, len(input))
	for index, value := range input {
		output[index] = float64(value)
	}
	return output
}
