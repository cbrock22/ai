#!/bin/bash

echo "========================================"
echo "Image Upload App - Setup Script"
echo "========================================"
echo ""

echo "Installing backend dependencies..."
cd backend
npm install
if [ $? -ne 0 ]; then
    echo "Error installing backend dependencies!"
    exit 1
fi
cd ..

echo ""
echo "Installing frontend dependencies..."
cd frontend
npm install
if [ $? -ne 0 ]; then
    echo "Error installing frontend dependencies!"
    exit 1
fi
cd ..

echo ""
echo "========================================"
echo "Setup completed successfully!"
echo "========================================"
echo ""
echo "To run the application:"
echo "  1. Open a terminal and run: cd backend && npm start"
echo "  2. Open another terminal and run: cd frontend && npm start"
echo ""
echo "The app will be available at http://localhost:3000"
echo ""
