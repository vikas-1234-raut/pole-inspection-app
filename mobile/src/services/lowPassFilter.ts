// // Smooths one sensor value while retaining only the previous filtered value.
// export class LowPassFilter {
//   private previous: number | null = null;

//   // Blend a new value with the previous filtered value using alpha.
//   filter(value: number, alpha: number): number {
//     if (this.previous === null) {
//       this.previous = value;
//       return value;
//     }
//     this.previous = alpha * value + (1 - alpha) * this.previous;
//     return this.previous;
//   }

//   // Clear the saved value so the next sample initializes the filter again.
//   reset(): void {
//     this.previous = null;
//   }
// }


// Smooths one sensor value while retaining only the previous filtered value.
export class LowPassFilter {
  private previous: number | null = null;

  // Blend a new value with the previous filtered value using alpha.
  filter(value: number, alpha: number): number {
    if (this.previous === null) {
      this.previous = value;
      return value;
    }
    this.previous = alpha * value + (1 - alpha) * this.previous;
    return this.previous;
  }

  // Clear the saved value so the next sample initializes the filter again.
  reset(): void {
    this.previous = null;
  }
}
