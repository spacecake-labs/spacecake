import math
import pandas as pd

from dataclasses import dataclass
from datetime import datetime

@dataclass
class Person:
    name: str
    age: int

def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

class Calculator:
    def add(self, a, b):
        return a + b
    
    
if __name__ == "__main__":
    text = input("echo: ")
    print(text)