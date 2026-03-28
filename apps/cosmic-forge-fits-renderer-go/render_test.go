package main

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"github.com/astrogo/fitsio"
)

func TestRenderFITSToPNG(t *testing.T) {
	tempDir := t.TempDir()
	inputPath := filepath.Join(tempDir, "sample.fits")
	outputPath := filepath.Join(tempDir, "sample.png")

	if err := writeTestFITS(inputPath); err != nil {
		t.Fatalf("could not write test fits: %v", err)
	}

	if err := RenderFITSToPNG(inputPath, outputPath); err != nil {
		t.Fatalf("could not render fits: %v", err)
	}

	file, err := os.Open(outputPath)
	if err != nil {
		t.Fatalf("could not open output png: %v", err)
	}
	defer file.Close()

	image, err := png.Decode(file)
	if err != nil {
		t.Fatalf("could not decode output png: %v", err)
	}

	bounds := image.Bounds()
	if bounds.Dx() != 4 || bounds.Dy() != 4 {
		t.Fatalf("unexpected output dimensions: %dx%d", bounds.Dx(), bounds.Dy())
	}
}

func writeTestFITS(path string) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()

	fitsFile, err := fitsio.Create(file)
	if err != nil {
		return err
	}
	defer fitsFile.Close()

	imageHDU := fitsio.NewImage(-64, []int{4, 4})
	data := []float64{
		1, 2, 3, 4,
		5, 6, 7, 8,
		9, 10, 11, 12,
		13, 14, 15, 16,
	}
	if err := imageHDU.Write(&data); err != nil {
		return err
	}

	return fitsFile.Write(imageHDU)
}
