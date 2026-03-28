package main

import (
	"flag"
	"fmt"
	"os"
)

func main() {
	input := flag.String("input", "", "Path to the input FITS file")
	output := flag.String("output", "", "Path to the output PNG file")
	flag.Parse()

	if *input == "" || *output == "" {
		fmt.Fprintln(os.Stderr, "usage: fits-renderer --input <fits> --output <png>")
		os.Exit(2)
	}

	if err := RenderFITSToPNG(*input, *output); err != nil {
		fmt.Fprintf(os.Stderr, "fits render failed: %v\n", err)
		os.Exit(1)
	}
}
