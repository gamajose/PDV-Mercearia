namespace Pdv.Domain.Enums;

public enum PaymentMethod
{
    Cash = 1,
    DebitCard = 2,
    CreditCard = 3,
    Pix = 4,
    CustomerCredit = 5, // Crediário próprio / Caderneta / Fiado
    Check = 6,
    Voucher = 7
}
