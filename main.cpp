#include "./codec.cpp"
#include <fstream>
#include <iostream>
#include <string>
#include <chrono>

int main(int argc, char *argv[]) {
    if (argc < 4) {
        std::cerr << "Must have three arguments (type, input, output)";
        return -1;
    }
    std::string type = argv[1];

    std::ifstream inputFile(argv[2]);
    int inputLength = (AUDIO_FREQUENCY / 60) * 4;
    unsigned char input[inputLength];
    inputFile.readsome((char *)input, inputLength);
    inputFile.close();

    int length;
    char *encoded;
    std::ofstream outputFile(argv[3]);
    if (type == "encode") {
        auto start = std::chrono::high_resolution_clock::now();
        encoded = (char *)encode(input);
        std::cout << std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::high_resolution_clock::now() - start).count() << "ms\n";
        length = (AUDIO_FREQUENCY / 60) * 4;
    } else if (type == "decode") {
        int idx = 0;
        auto start = std::chrono::high_resolution_clock::now();
        encoded = (char *)decode((unsigned int *)input, &idx);
        std::cout << std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::high_resolution_clock::now() - start).count() << "ms\n";
        length = FRAME_WIDTH * FRAME_HEIGHT * 3;
    } else {
        std::cerr << "type must only be one of `encode`, `decode`, saw `" << type << "`";
        return -1;
    }
    outputFile.write(encoded, length);
}